"""Handlers for Modulr.Core MVP operations."""

from __future__ import annotations

import json
import re
import secrets
import sqlite3
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from modulr_core.clock import EpochClock
from modulr_core.config.schema import Settings
from modulr_core.errors.codes import ErrorCode, SuccessCode
from modulr_core.errors.exceptions import InvalidHexEncoding, WireValidationError
from modulr_core.http.envelope import success_response_envelope
from modulr_core.messages.types import ValidatedInbound
from modulr_core.operations.authorize import require_bootstrap_to_register_module
from modulr_core.operations.payload_util import (
    optional_dict,
    optional_json_value,
    require_dict,
    require_str,
)
from modulr_core.repositories.heartbeat import HeartbeatRepository
from modulr_core.repositories.modules import ModulesRepository
from modulr_core.repositories.name_bindings import NameBindingsRepository
from modulr_core.validation import canonical_json_str, decode_hex_fixed
from modulr_core.validation.names import validate_modulr_resolve_name

_MODULE_NAME_RE = re.compile(
    r"^[a-zA-Z][a-zA-Z0-9_.-]*\.[a-zA-Z][a-zA-Z0-9_.-]+$",
)
_MAX_METRICS_CANONICAL_BYTES = 65_536


def handle_register_module(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    env = validated.envelope
    require_bootstrap_to_register_module(
        settings=settings,
        sender_public_key_hex=env["sender_public_key"],
    )
    p: dict[str, Any] = env["payload"]
    module_name = require_str(p, "module_name")
    if not _MODULE_NAME_RE.match(module_name):
        raise WireValidationError(
            "module_name must be a dotted logical name (e.g. modulr.storage)",
            code=ErrorCode.INVALID_MODULE_NAME,
        )
    module_version = require_str(p, "module_version")
    route = require_dict(p, "route")
    try:
        route_json = canonical_json_str(route)
    except (TypeError, ValueError) as e:
        raise WireValidationError(
            f"payload.route is not JSON-serializable: {e}",
            code=ErrorCode.INVALID_ROUTE,
        ) from e

    cap_raw = optional_json_value(p, "capabilities")
    meta_raw = optional_json_value(p, "metadata")
    cap_json = canonical_json_str(cap_raw) if cap_raw is not None else None
    meta_json = canonical_json_str(meta_raw) if meta_raw is not None else None

    key_hex = require_str(p, "signing_public_key")
    try:
        key_bytes = decode_hex_fixed(key_hex, byte_length=32)
        Ed25519PublicKey.from_public_bytes(key_bytes)
    except InvalidHexEncoding as e:
        raise WireValidationError(str(e), code=ErrorCode.PUBLIC_KEY_INVALID) from e
    except ValueError as e:
        raise WireValidationError(
            str(e),
            code=ErrorCode.PUBLIC_KEY_INVALID,
        ) from e

    now = int(clock())
    repo = ModulesRepository(conn)
    try:
        repo.insert(
            module_name=module_name,
            module_version=module_version,
            route_json=route_json,
            capabilities_json=cap_json,
            metadata_json=meta_json,
            signing_public_key=key_bytes,
            registered_by_sender_id=env["sender_id"],
            registered_at=now,
        )
    except sqlite3.IntegrityError:
        existing = repo.get_by_name(module_name)
        if existing is None:
            raise
        if _module_row_matches_request(
            existing,
            module_version=module_version,
            route_json=route_json,
            capabilities_json=cap_json,
            metadata_json=meta_json,
            signing_public_key=key_bytes,
            registered_by_sender_id=env["sender_id"],
        ):
            pass  # idempotent replay
        else:
            raise WireValidationError(
                "module_name is already registered with different data",
                code=ErrorCode.MODULE_ALREADY_REGISTERED,
            ) from None

    out_payload: dict[str, Any] = {"module_name": module_name}
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="register_module_response",
        success_code=SuccessCode.MODULE_REGISTERED,
        detail="Module registered.",
        payload=out_payload,
        clock=clock,
    )


def _module_row_matches_request(
    row: dict[str, Any],
    *,
    module_version: str,
    route_json: str,
    capabilities_json: str | None,
    metadata_json: str | None,
    signing_public_key: bytes,
    registered_by_sender_id: str,
) -> bool:
    sk = row["signing_public_key"]
    if isinstance(sk, memoryview):
        sk = sk.tobytes()
    return (
        row["module_version"] == module_version
        and row["route_json"] == route_json
        and (row["capabilities_json"] or None) == (capabilities_json or None)
        and (row["metadata_json"] or None) == (metadata_json or None)
        and sk == signing_public_key
        and row["registered_by_sender_id"] == registered_by_sender_id
    )


def handle_lookup_module(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    del settings
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    module_name = require_str(p, "module_name")
    if not _MODULE_NAME_RE.match(module_name):
        raise WireValidationError(
            "module_name must be a dotted logical name",
            code=ErrorCode.INVALID_MODULE_NAME,
        )
    row = ModulesRepository(conn).get_by_name(module_name)
    if row is None:
        raise WireValidationError(
            f"module {module_name!r} not found",
            code=ErrorCode.MODULE_NOT_FOUND,
        )
    out_payload = _module_row_to_payload(row)
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="lookup_module_response",
        success_code=SuccessCode.MODULE_FOUND,
        detail="Module found.",
        payload=out_payload,
        clock=clock,
    )


def _module_row_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    sk = row["signing_public_key"]
    if isinstance(sk, memoryview):
        sk = sk.tobytes()
    return {
        "module_name": row["module_name"],
        "module_version": row["module_version"],
        "route": json.loads(row["route_json"]),
        "capabilities": json.loads(row["capabilities_json"])
        if row["capabilities_json"]
        else None,
        "metadata": json.loads(row["metadata_json"])
        if row["metadata_json"]
        else None,
        "signing_public_key": sk.hex(),
        "registered_by_sender_id": row["registered_by_sender_id"],
        "registered_at": row["registered_at"],
    }


def handle_resolve_name(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    del settings
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    raw = require_str(p, "name")
    name = validate_modulr_resolve_name(raw)
    row = NameBindingsRepository(conn).get_by_name(name)
    if row is None:
        raise WireValidationError(
            f"name {name!r} not found",
            code=ErrorCode.NAME_NOT_FOUND,
        )
    out_payload: dict[str, Any] = {
        "name": row["name"],
        "resolved_id": row["resolved_id"],
        "route": json.loads(row["route_json"]) if row["route_json"] else None,
        "metadata": json.loads(row["metadata_json"]) if row["metadata_json"] else None,
        "created_at": row["created_at"],
    }
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="resolve_name_response",
        success_code=SuccessCode.NAME_RESOLVED,
        detail="Name resolved.",
        payload=out_payload,
        clock=clock,
    )


def handle_heartbeat_update(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    del settings
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    module_name = require_str(p, "module_name")
    if not _MODULE_NAME_RE.match(module_name):
        raise WireValidationError(
            "module_name must be a dotted logical name",
            code=ErrorCode.INVALID_MODULE_NAME,
        )
    module_version = require_str(p, "module_version")
    status = require_str(p, "status")
    route = optional_dict(p, "route")
    metrics = optional_json_value(p, "metrics")
    if metrics is not None and not isinstance(metrics, dict):
        raise WireValidationError(
            "payload.metrics must be a JSON object or null",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    route_json = canonical_json_str(route) if route is not None else None
    metrics_json = None
    if metrics is not None:
        try:
            metrics_json = canonical_json_str(metrics)
        except (TypeError, ValueError) as e:
            raise WireValidationError(
                f"payload.metrics is not JSON-serializable: {e}",
                code=ErrorCode.PAYLOAD_INVALID,
            ) from e
        if len(metrics_json.encode("utf-8")) > _MAX_METRICS_CANONICAL_BYTES:
            raise WireValidationError(
                "metrics object is too large",
                code=ErrorCode.METRICS_TOO_LARGE,
            )

    last_raw = p.get("last_seen_at")
    if last_raw is None:
        last_seen_at = int(clock())
    elif isinstance(last_raw, bool):
        raise WireValidationError(
            "payload.last_seen_at must be a number",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    elif isinstance(last_raw, (int, float)):
        last_seen_at = int(last_raw)
    else:
        raise WireValidationError(
            "payload.last_seen_at must be a number or null",
            code=ErrorCode.PAYLOAD_INVALID,
        )

    modules = ModulesRepository(conn)
    mod_row = modules.get_by_name(module_name)
    if mod_row is None:
        raise WireValidationError(
            f"module {module_name!r} is not registered",
            code=ErrorCode.MODULE_NOT_FOUND,
        )
    reg_key = mod_row["signing_public_key"]
    if isinstance(reg_key, memoryview):
        reg_key = reg_key.tobytes()
    if not secrets.compare_digest(validated.sender_public_key, reg_key):
        raise WireValidationError(
            "sender key does not match registered module signing_public_key",
            code=ErrorCode.IDENTITY_MISMATCH,
        )

    HeartbeatRepository(conn).upsert(
        module_name=module_name,
        module_version=module_version,
        status=status,
        route_json=route_json,
        metrics_json=metrics_json,
        last_seen_at=last_seen_at,
    )
    out_payload = {
        "module_name": module_name,
        "module_version": module_version,
        "status": status,
        "last_seen_at": last_seen_at,
    }
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="heartbeat_update_response",
        success_code=SuccessCode.HEARTBEAT_RECORDED,
        detail="Heartbeat recorded.",
        payload=out_payload,
        clock=clock,
    )

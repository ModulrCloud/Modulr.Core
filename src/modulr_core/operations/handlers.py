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
from modulr_core.messages.constants import CORE_OPERATIONS
from modulr_core.messages.types import ValidatedInbound
from modulr_core.operations.authorize import (
    require_bootstrap_sender,
    require_bootstrap_to_register_module,
)
from modulr_core.operations.module_names import (
    BUILTIN_CORE_SIGNING_PUBLIC_KEY_HEX,
    CANONICAL_CORE_MODULE_NAME,
    normalize_module_name,
)
from modulr_core.operations.payload_util import (
    optional_dict,
    optional_ed25519_public_key_hex,
    optional_int,
    optional_json_value,
    require_dict,
    require_str,
)
from modulr_core.repositories.core_advertised_route import CoreAdvertisedRouteRepository
from modulr_core.repositories.dial_route_entry import DialRouteEntryRepository
from modulr_core.repositories.heartbeat import HeartbeatRepository
from modulr_core.repositories.modules import ModulesRepository
from modulr_core.repositories.name_bindings import NameBindingsRepository
from modulr_core.validation import canonical_json_str, decode_hex_fixed
from modulr_core.validation.names import (
    validate_modulr_org_domain,
    validate_modulr_resolve_name,
    validate_resolved_id,
)
from modulr_core.version import MODULE_VERSION

_MODULE_NAME_RE = re.compile(
    r"^[a-zA-Z][a-zA-Z0-9_.-]*\.[a-zA-Z][a-zA-Z0-9_.-]+$",
)
_MAX_METRICS_CANONICAL_BYTES = 65_536


def _parse_submit_route_mode(p: dict[str, Any]) -> str:
    """Omitted mode → ``replace_all`` (single canonical dial; backward compatible).

    Explicit ``merge`` adds/updates one dial without dropping siblings.
    """
    v = p.get("mode")
    if v is None:
        return "replace_all"
    if not isinstance(v, str) or not v.strip():
        raise WireValidationError(
            "payload.mode must be a non-empty string or omitted",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    m = v.strip().lower()
    if m in ("merge", "replace_all"):
        return m
    raise WireValidationError(
        'payload.mode must be "merge" or "replace_all"',
        code=ErrorCode.PAYLOAD_INVALID,
    )


def _parse_route_priority(p: dict[str, Any]) -> int:
    v = optional_int(p, "priority")
    return 0 if v is None else v


def _sync_legacy_route_to_primary_dial(
    conn: sqlite3.Connection,
    *,
    scope: str,
    is_core: bool,
    module_row_name: str | None,
    now_ts: int,
) -> None:
    """Point legacy single-route JSON at the primary row (first by priority, id)."""
    rows = DialRouteEntryRepository(conn).list_by_scope(scope)
    if not rows:
        return
    first = rows[0]
    route_json = canonical_json_str({
        "route_type": first["route_type"],
        "route": first["route"],
    })
    if is_core:
        CoreAdvertisedRouteRepository(conn).upsert(
            route_json=route_json,
            updated_at=now_ts,
        )
    else:
        assert module_row_name is not None
        ModulesRepository(conn).update_route_json(
            module_name=module_row_name,
            route_json=route_json,
        )


def _parse_wire_module_name(p: dict[str, Any], *, field: str = "module_name") -> str:
    """Strip, validate dotted form, return lowercase canonical module id."""
    raw = require_str(p, field).strip()
    if not raw:
        raise WireValidationError(
            f"{field} must not be empty",
            code=ErrorCode.INVALID_MODULE_NAME,
        )
    if not _MODULE_NAME_RE.match(raw):
        raise WireValidationError(
            f"{field} must be a dotted logical name (e.g. modulr.storage)",
            code=ErrorCode.INVALID_MODULE_NAME,
        )
    return normalize_module_name(raw)


def _modulr_core_route_document(conn: sqlite3.Connection) -> dict[str, Any]:
    """Route JSON object for built-in ``modulr.core`` (advertised row or default)."""
    route: dict[str, Any] = {
        "kind": "modulr.core",
        "note": "Built-in coordination plane; not stored in modules table.",
    }
    raw = CoreAdvertisedRouteRepository(conn).get_route_json()
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            route = parsed
    return route


def _dial_row_to_wire(row: dict[str, Any]) -> dict[str, Any]:
    """Serialize a ``dial_route_entry`` row for wire payloads."""
    pk = row.get("endpoint_signing_public_key_hex")
    if isinstance(pk, memoryview):
        pk = pk.tobytes().decode("utf-8")
    out: dict[str, Any] = {
        "id": row["id"],
        "route_type": row["route_type"],
        "route": row["route"],
        "priority": row["priority"],
    }
    if pk:
        out["endpoint_signing_public_key_hex"] = pk
    return out


def _get_module_route_response_payload(
    module_id: str,
    route_document: Any,
) -> dict[str, Any]:
    """Shape ``get_module_route`` payload from stored route JSON."""
    out: dict[str, Any] = {
        "module_id": module_id,
        "route_detail": route_document,
    }
    if isinstance(route_document, dict):
        rt = route_document.get("route_type")
        ep = route_document.get("route")
        if isinstance(rt, str) and isinstance(ep, str):
            out["route_type"] = rt
            out["route"] = ep
    return out


def _builtin_core_lookup_payload(
    *,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    """Synthetic ``lookup_module`` row for the running Core (not in ``modules``)."""
    dials = DialRouteEntryRepository(conn).list_by_scope(CANONICAL_CORE_MODULE_NAME)
    if dials:
        first = dials[0]
        route: Any = {"route_type": first["route_type"], "route": first["route"]}
        routes_wire = [_dial_row_to_wire(r) for r in dials]
    else:
        route = _modulr_core_route_document(conn)
        routes_wire = []
    return {
        "module_name": CANONICAL_CORE_MODULE_NAME,
        "module_version": MODULE_VERSION,
        "route": route,
        "routes": routes_wire,
        "capabilities": None,
        "metadata": {"builtin": True},
        "signing_public_key": BUILTIN_CORE_SIGNING_PUBLIC_KEY_HEX,
        "registered_by_sender_id": "modulr:network:core",
        "registered_at": int(clock()),
    }


def handle_get_protocol_version(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    """Return the wire protocol version Core accepts (inbound ``protocol_version``)."""
    del settings, conn
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    if p:
        raise WireValidationError(
            "get_protocol_version expects an empty payload object",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="get_protocol_version_response",
        success_code=SuccessCode.PROTOCOL_VERSION_RETURNED,
        detail="Protocol version.",
        payload={"protocol_version": MODULE_VERSION},
        clock=clock,
    )


def handle_get_module_functions(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    """Return Core wire op names for ``modulr.core``; else empty ``operations``."""
    del settings
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    module_id = _parse_wire_module_name(p, field="module_id")
    if module_id == CANONICAL_CORE_MODULE_NAME:
        ops = sorted(CORE_OPERATIONS)
        return success_response_envelope(
            request_message_id=env["message_id"],
            operation_response="get_module_functions_response",
            success_code=SuccessCode.MODULE_FUNCTIONS_RETURNED,
            detail="Operations implemented by modulr.core on the wire.",
            payload={
                "module_id": module_id,
                "operations": ops,
                "operation_count": len(ops),
            },
        clock=clock,
    )
    row = ModulesRepository(conn).get_by_name(module_id)
    if row is None:
        raise WireValidationError(
            f"module {module_id!r} not found",
            code=ErrorCode.MODULE_NOT_FOUND,
        )
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="get_module_functions_response",
        success_code=SuccessCode.MODULE_FUNCTIONS_RETURNED,
        detail="No operation manifest stored for this module.",
        payload={
            "module_id": module_id,
            "operations": [],
            "operation_count": 0,
        },
        clock=clock,
    )


def handle_get_module_route(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    """Return stored route JSON for a registered module or built-in ``modulr.core``."""
    del settings
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    module_id = _parse_wire_module_name(p, field="module_id")
    if module_id == CANONICAL_CORE_MODULE_NAME:
        dials = DialRouteEntryRepository(conn).list_by_scope(CANONICAL_CORE_MODULE_NAME)
        if dials:
            route_doc: Any = {
                "route_type": dials[0]["route_type"],
                "route": dials[0]["route"],
            }
        else:
            route_doc = _modulr_core_route_document(conn)
        payload = _get_module_route_response_payload(
            CANONICAL_CORE_MODULE_NAME,
            route_doc,
        )
        payload["routes"] = [_dial_row_to_wire(r) for r in dials]
        return success_response_envelope(
            request_message_id=env["message_id"],
            operation_response="get_module_route_response",
            success_code=SuccessCode.MODULE_ROUTE_RETURNED,
            detail="Module route returned.",
            payload=payload,
            clock=clock,
        )
    row = ModulesRepository(conn).get_by_name(module_id)
    if row is None:
        raise WireValidationError(
            f"module {module_id!r} not found",
            code=ErrorCode.MODULE_NOT_FOUND,
        )
    scope = normalize_module_name(str(row["module_name"]))
    dials = DialRouteEntryRepository(conn).list_by_scope(scope)
    try:
        route_json_obj = json.loads(row["route_json"])
    except json.JSONDecodeError as e:
        raise WireValidationError(
            f"stored route_json is invalid: {e}",
            code=ErrorCode.INVALID_ROUTE,
        ) from e
    canonical_name = str(row["module_name"])
    if dials:
        route_doc = {
            "route_type": dials[0]["route_type"],
            "route": dials[0]["route"],
        }
    else:
        route_doc = route_json_obj
    payload = _get_module_route_response_payload(canonical_name, route_doc)
    payload["routes"] = [_dial_row_to_wire(r) for r in dials]
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="get_module_route_response",
        success_code=SuccessCode.MODULE_ROUTE_RETURNED,
        detail="Module route returned.",
        payload=payload,
        clock=clock,
    )


def handle_submit_module_route(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    module_id = _parse_wire_module_name(p, field="module_id")
    route_type = require_str(p, "route_type").strip()
    route = require_str(p, "route").strip()
    if not route_type:
        raise WireValidationError(
            "route_type must not be empty",
            code=ErrorCode.INVALID_ROUTE,
        )
    if not route:
        raise WireValidationError(
            "route must not be empty",
            code=ErrorCode.INVALID_ROUTE,
        )
    mode = _parse_submit_route_mode(p)
    priority = _parse_route_priority(p)
    endpoint_pk = optional_ed25519_public_key_hex(p)
    now_ts = int(clock())
    dial_repo = DialRouteEntryRepository(conn)

    if module_id == CANONICAL_CORE_MODULE_NAME:
        if mode == "merge":
            require_bootstrap_sender(
                settings=settings,
                sender_public_key_hex=env["sender_public_key"],
            )
        if mode == "replace_all":
            dial_repo.replace_all_for_scope(
                scope=CANONICAL_CORE_MODULE_NAME,
                entries=[(route_type, route, priority, endpoint_pk)],
                now=now_ts,
            )
        else:
            dial_repo.upsert_merge(
                scope=CANONICAL_CORE_MODULE_NAME,
                route_type=route_type,
                route=route,
                priority=priority,
                endpoint_signing_public_key_hex=endpoint_pk,
                now=now_ts,
            )
        _sync_legacy_route_to_primary_dial(
            conn,
            scope=CANONICAL_CORE_MODULE_NAME,
            is_core=True,
            module_row_name=None,
            now_ts=now_ts,
        )
        return success_response_envelope(
            request_message_id=env["message_id"],
            operation_response="submit_module_route_response",
            success_code=SuccessCode.MODULE_ROUTE_SUBMITTED,
            detail="Modulr.Core advertised route stored.",
            payload={
                "module_id": CANONICAL_CORE_MODULE_NAME,
                "route_type": route_type,
                "route": route,
                "mode": mode,
                "priority": priority,
            },
            clock=clock,
        )

    modules = ModulesRepository(conn)
    mod_row = modules.get_by_name(module_id)
    if mod_row is None:
        raise WireValidationError(
            f"module {module_id!r} not found",
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
    canonical_name = str(mod_row["module_name"])
    scope = normalize_module_name(canonical_name)
    if mode == "replace_all":
        dial_repo.replace_all_for_scope(
            scope=scope,
            entries=[(route_type, route, priority, endpoint_pk)],
            now=now_ts,
        )
    else:
        dial_repo.upsert_merge(
            scope=scope,
            route_type=route_type,
            route=route,
            priority=priority,
            endpoint_signing_public_key_hex=endpoint_pk,
            now=now_ts,
        )
    _sync_legacy_route_to_primary_dial(
        conn,
        scope=scope,
        is_core=False,
        module_row_name=canonical_name,
        now_ts=now_ts,
    )
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="submit_module_route_response",
        success_code=SuccessCode.MODULE_ROUTE_SUBMITTED,
        detail="Module route updated.",
        payload={
            "module_id": canonical_name,
            "route_type": route_type,
            "route": route,
            "mode": mode,
            "priority": priority,
        },
        clock=clock,
    )


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
    module_name = _parse_wire_module_name(p)
    if module_name == CANONICAL_CORE_MODULE_NAME:
        raise WireValidationError(
            f"{CANONICAL_CORE_MODULE_NAME!r} is reserved and cannot be registered",
            code=ErrorCode.MODULE_NAME_RESERVED,
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
    module_name = _parse_wire_module_name(p)
    if module_name == CANONICAL_CORE_MODULE_NAME:
        out_payload = _builtin_core_lookup_payload(conn=conn, clock=clock)
        return success_response_envelope(
            request_message_id=env["message_id"],
            operation_response="lookup_module_response",
            success_code=SuccessCode.MODULE_FOUND,
            detail="Module found.",
            payload=out_payload,
            clock=clock,
        )
    row = ModulesRepository(conn).get_by_name(module_name)
    if row is None:
        raise WireValidationError(
            f"module {module_name!r} not found",
            code=ErrorCode.MODULE_NOT_FOUND,
        )
    out_payload = _module_row_to_lookup_payload(row, conn)
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="lookup_module_response",
        success_code=SuccessCode.MODULE_FOUND,
        detail="Module found.",
        payload=out_payload,
        clock=clock,
    )


def _module_row_to_lookup_payload(
    row: dict[str, Any],
    conn: sqlite3.Connection,
) -> dict[str, Any]:
    sk = row["signing_public_key"]
    if isinstance(sk, memoryview):
        sk = sk.tobytes()
    scope = normalize_module_name(str(row["module_name"]))
    dials = DialRouteEntryRepository(conn).list_by_scope(scope)
    if dials:
        first = dials[0]
        route: Any = {"route_type": first["route_type"], "route": first["route"]}
        routes_wire = [_dial_row_to_wire(r) for r in dials]
    else:
        route = json.loads(row["route_json"])
        routes_wire = []
    return {
        "module_name": row["module_name"],
        "module_version": row["module_version"],
        "route": route,
        "routes": routes_wire,
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


def _norm_json_text_cell(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, memoryview):
        value = value.tobytes().decode("utf-8")
    return value if value else None


def _binding_row_matches(
    row: dict[str, Any],
    *,
    resolved_id: str,
    route_json: str | None,
    metadata_json: str | None,
) -> bool:
    rj = _norm_json_text_cell(row.get("route_json"))
    mj = _norm_json_text_cell(row.get("metadata_json"))
    return (
        row["resolved_id"] == resolved_id
        and rj == (route_json or None)
        and mj == (metadata_json or None)
    )


def _name_binding_row_to_entry(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": row["name"],
        "resolved_id": row["resolved_id"],
        "route": json.loads(row["route_json"]) if row["route_json"] else None,
        "metadata": json.loads(row["metadata_json"]) if row["metadata_json"] else None,
        "created_at": row["created_at"],
    }


def _insert_name_binding_idempotent(
    repo: NameBindingsRepository,
    *,
    name: str,
    resolved_id: str,
    route_json: str | None,
    metadata_json: str | None,
    now: int,
    conflict_message: str,
) -> tuple[int, bool]:
    """Insert a name binding; handle races like :func:`handle_register_module`.

    Returns ``(created_at, is_new_insert)``. On duplicate key with mismatched data,
    raises ``NAME_ALREADY_BOUND`` with ``conflict_message``.
    """
    existing = repo.get_by_name(name)
    if existing is not None:
        if _binding_row_matches(
            existing,
            resolved_id=resolved_id,
            route_json=route_json,
            metadata_json=metadata_json,
        ):
            return (existing["created_at"], False)
        raise WireValidationError(
            conflict_message,
            code=ErrorCode.NAME_ALREADY_BOUND,
        )

    try:
        repo.insert(
            name=name,
            resolved_id=resolved_id,
            route_json=route_json,
            metadata_json=metadata_json,
            created_at=now,
        )
    except sqlite3.IntegrityError:
        existing = repo.get_by_name(name)
        if existing is None:
            raise
        if _binding_row_matches(
            existing,
            resolved_id=resolved_id,
            route_json=route_json,
            metadata_json=metadata_json,
        ):
            return (existing["created_at"], False)
        raise WireValidationError(
            conflict_message,
            code=ErrorCode.NAME_ALREADY_BOUND,
        ) from None
    return (now, True)


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


def handle_register_name(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    env = validated.envelope
    require_bootstrap_sender(
        settings=settings,
        sender_public_key_hex=env["sender_public_key"],
    )
    p: dict[str, Any] = env["payload"]
    name = validate_modulr_resolve_name(require_str(p, "name"))
    resolved_id = validate_resolved_id(require_str(p, "resolved_id"))
    route = optional_dict(p, "route")
    metadata = optional_json_value(p, "metadata")
    if metadata is not None and not isinstance(metadata, dict):
        raise WireValidationError(
            "payload.metadata must be a JSON object or null",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    try:
        route_json = canonical_json_str(route) if route is not None else None
        meta_json = canonical_json_str(metadata) if metadata is not None else None
    except (TypeError, ValueError) as e:
        raise WireValidationError(str(e), code=ErrorCode.PAYLOAD_INVALID) from e

    repo = NameBindingsRepository(conn)
    now = int(clock())
    created_at, is_new = _insert_name_binding_idempotent(
        repo,
        name=name,
        resolved_id=resolved_id,
        route_json=route_json,
        metadata_json=meta_json,
        now=now,
        conflict_message="name is already bound to different data",
    )
    out_payload: dict[str, Any] = {
        "name": name,
        "resolved_id": resolved_id,
        "created_at": created_at,
    }
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="register_name_response",
        success_code=SuccessCode.NAME_REGISTERED,
        detail=(
            "Name registered."
            if is_new
            else "Name already registered (idempotent)."
        ),
        payload=out_payload,
        clock=clock,
    )


def handle_register_org(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    env = validated.envelope
    require_bootstrap_sender(
        settings=settings,
        sender_public_key_hex=env["sender_public_key"],
    )
    p: dict[str, Any] = env["payload"]
    name = validate_modulr_org_domain(require_str(p, "organization_name"))
    resolved_id = validate_resolved_id(require_str(p, "resolved_id"))
    route = optional_dict(p, "route")
    metadata = optional_json_value(p, "metadata")
    if metadata is not None and not isinstance(metadata, dict):
        raise WireValidationError(
            "payload.metadata must be a JSON object or null",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    try:
        route_json = canonical_json_str(route) if route is not None else None
        meta_json = canonical_json_str(metadata) if metadata is not None else None
    except (TypeError, ValueError) as e:
        raise WireValidationError(str(e), code=ErrorCode.PAYLOAD_INVALID) from e

    repo = NameBindingsRepository(conn)
    now = int(clock())
    created_at, is_new = _insert_name_binding_idempotent(
        repo,
        name=name,
        resolved_id=resolved_id,
        route_json=route_json,
        metadata_json=meta_json,
        now=now,
        conflict_message="organization_name is already bound to different data",
    )
    org_payload: dict[str, Any] = {
        "organization_name": name,
        "resolved_id": resolved_id,
        "created_at": created_at,
    }
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="register_org_response",
        success_code=SuccessCode.ORG_REGISTERED,
        detail=(
            "Organization registered."
            if is_new
            else "Organization already registered (idempotent)."
        ),
        payload=org_payload,
        clock=clock,
    )


def handle_reverse_resolve_name(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    del settings
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    resolved_id = validate_resolved_id(require_str(p, "resolved_id"))
    rows = NameBindingsRepository(conn).list_by_resolved_id(resolved_id)
    if not rows:
        raise WireValidationError(
            f"no names bound to resolved_id {resolved_id!r}",
            code=ErrorCode.IDENTITY_NOT_FOUND,
        )
    names = [_name_binding_row_to_entry(r) for r in rows]
    out_payload: dict[str, Any] = {
        "resolved_id": resolved_id,
        "names": names,
    }
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="reverse_resolve_name_response",
        success_code=SuccessCode.NAME_REVERSE_RESOLVED,
        detail="Identity reverse-resolved.",
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
    module_name = _parse_wire_module_name(p)
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

    canonical_name = str(mod_row["module_name"])
    HeartbeatRepository(conn).upsert(
        module_name=canonical_name,
        module_version=module_version,
        status=status,
        route_json=route_json,
        metrics_json=metrics_json,
        last_seen_at=last_seen_at,
    )
    out_payload = {
        "module_name": canonical_name,
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

"""Handlers for Modulr.Core MVP operations."""

from __future__ import annotations

import json
import math
import secrets
import sqlite3
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from modulr_core.clock import EpochClock
from modulr_core.config.schema import Settings
from modulr_core.errors.codes import ErrorCode, SuccessCode
from modulr_core.errors.exceptions import InvalidHexEncoding, WireValidationError
from modulr_core.genesis.local_invoke import genesis_branding_payload
from modulr_core.http.envelope import success_response_envelope
from modulr_core.messages.types import ValidatedInbound
from modulr_core.messages.wire_method_catalog import (
    CATALOG_SCHEMA_VERSION,
    build_core_module_methods_payload,
    build_protocol_methods_payload,
)
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
from modulr_core.repositories.module_state_snapshot import (
    ModuleStateSnapshotRepository,
)
from modulr_core.repositories.modules import ModulesRepository
from modulr_core.repositories.name_bindings import NameBindingsRepository
from modulr_core.validation import canonical_json_str, decode_hex_fixed
from modulr_core.validation.names import (
    validate_modulr_core_registry_apex_name,
    validate_modulr_org_domain,
    validate_modulr_resolve_name,
    validate_resolved_id,
)
from modulr_core.version import MODULE_VERSION

_MAX_METRICS_CANONICAL_BYTES = 65_536
_MODULE_STATE_PHASES: frozenset[str] = frozenset(
    ("running", "syncing", "degraded", "maintenance"),
)
_MAX_MODULE_STATE_DETAIL_CHARS = 16_384

_MODULE_STATE_DETAIL_SCHEMA_VERSION = 2
_MODULE_STATE_DETAIL_AUX_LABEL_MAX_LEN = 40
_HEALTH_ACTIVITY_24H_ALLOWED_KEYS: frozenset[str] = frozenset({
    "granularity_hours",
    "jobs_points",
    "aux1_label",
    "aux1_points",
    "aux2_label",
    "aux2_points",
})
_MODULE_STATE_DETAIL_METRIC_KEYS: tuple[str, ...] = (
    "total_users",
    "active_users",
    "subscribers",
    "validators",
    "providers",
    "active_jobs",
)
_MAX_DASHBOARD_CARDS = 10
_MAX_DASHBOARD_PIES = 4
_MAX_PIE_SLICES = 5
_MAX_DASHBOARD_CARD_DESCRIPTION_CHARS = 280
_MAX_DASHBOARD_PIE_DESCRIPTION_CHARS = 280


def _json_nonneg_int(obj: dict[str, Any], path: str, key: str) -> int:
    if key not in obj:
        raise WireValidationError(
            f"{path}.{key} is required",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    v = obj[key]
    if type(v) is bool:
        raise WireValidationError(
            f"{path}.{key} must be a non-negative integer",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    if type(v) is int and v >= 0:
        return v
    if isinstance(v, float) and v.is_integer() and v >= 0:
        return int(v)
    raise WireValidationError(
        f"{path}.{key} must be a non-negative integer",
        code=ErrorCode.PAYLOAD_INVALID,
    )


def _json_pct_int(obj: dict[str, Any], path: str, key: str) -> int:
    if key not in obj:
        raise WireValidationError(
            f"{path}.{key} is required",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    v = obj[key]
    if type(v) is bool:
        raise WireValidationError(
            f"{path}.{key} must be an integer 0..100",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    if type(v) is int and 0 <= v <= 100:
        return v
    if isinstance(v, float) and v.is_integer() and 0 <= v <= 100:
        return int(v)
    raise WireValidationError(
        f"{path}.{key} must be an integer 0..100",
        code=ErrorCode.PAYLOAD_INVALID,
    )


def _validate_module_state_dashboard_cards(root: dict[str, Any]) -> None:
    dc = root.get("dashboard_cards")
    if not isinstance(dc, list):
        raise WireValidationError(
            "payload.detail.dashboard_cards must be a list",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    n = len(dc)
    if n < 1 or n > _MAX_DASHBOARD_CARDS:
        raise WireValidationError(
            "payload.detail.dashboard_cards must have length "
            f"between 1 and {_MAX_DASHBOARD_CARDS} inclusive",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    for i, item in enumerate(dc):
        if not isinstance(item, dict):
            raise WireValidationError(
                f"payload.detail.dashboard_cards[{i}] must be an object",
                code=ErrorCode.PAYLOAD_INVALID,
            )
        title = item.get("title")
        if not isinstance(title, str) or not title.strip():
            raise WireValidationError(
                f"payload.detail.dashboard_cards[{i}].title must be a non-empty string",
                code=ErrorCode.PAYLOAD_INVALID,
            )
        base = f"payload.detail.dashboard_cards[{i}]"
        _json_nonneg_int(item, base, "value")
        desc = item.get("description")
        if not isinstance(desc, str) or not desc.strip():
            raise WireValidationError(
                f"payload.detail.dashboard_cards[{i}].description must be a "
                "non-empty string",
                code=ErrorCode.PAYLOAD_INVALID,
            )
        if len(desc) > _MAX_DASHBOARD_CARD_DESCRIPTION_CHARS:
            mx = _MAX_DASHBOARD_CARD_DESCRIPTION_CHARS
            raise WireValidationError(
                f"payload.detail.dashboard_cards[{i}].description must be at "
                f"most {mx} characters",
                code=ErrorCode.PAYLOAD_INVALID,
            )


def _validate_module_state_dashboard_pies(root: dict[str, Any]) -> None:
    dp = root.get("dashboard_pies")
    if not isinstance(dp, list):
        raise WireValidationError(
            "payload.detail.dashboard_pies must be a list",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    if len(dp) > _MAX_DASHBOARD_PIES:
        raise WireValidationError(
            f"payload.detail.dashboard_pies must have at most {_MAX_DASHBOARD_PIES} "
            "entries",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    for i, pie in enumerate(dp):
        if not isinstance(pie, dict):
            raise WireValidationError(
                f"payload.detail.dashboard_pies[{i}] must be an object",
                code=ErrorCode.PAYLOAD_INVALID,
            )
        mn = pie.get("metric_name")
        if not isinstance(mn, str) or not mn.strip():
            raise WireValidationError(
                f"payload.detail.dashboard_pies[{i}].metric_name must be a "
                "non-empty string",
                code=ErrorCode.PAYLOAD_INVALID,
            )
        pbase = f"payload.detail.dashboard_pies[{i}]"
        _json_nonneg_int(pie, pbase, "total")
        desc = pie.get("description")
        if desc is not None:
            if not isinstance(desc, str):
                raise WireValidationError(
                    f"{pbase}.description must be a string or null",
                    code=ErrorCode.PAYLOAD_INVALID,
                )
            if len(desc) > _MAX_DASHBOARD_PIE_DESCRIPTION_CHARS:
                mx = _MAX_DASHBOARD_PIE_DESCRIPTION_CHARS
                raise WireValidationError(
                    f"{pbase}.description must be at most {mx} characters",
                    code=ErrorCode.PAYLOAD_INVALID,
                )
        slices = pie.get("slices")
        if not isinstance(slices, list):
            raise WireValidationError(
                f"{pbase}.slices must be a list",
                code=ErrorCode.PAYLOAD_INVALID,
            )
        ns = len(slices)
        if ns < 1 or ns > _MAX_PIE_SLICES:
            raise WireValidationError(
                f"{pbase}.slices must have length between 1 and "
                f"{_MAX_PIE_SLICES} inclusive",
                code=ErrorCode.PAYLOAD_INVALID,
            )
        total_pct = 0
        for j, sl in enumerate(slices):
            if not isinstance(sl, dict):
                raise WireValidationError(
                    f"{pbase}.slices[{j}] must be an object",
                    code=ErrorCode.PAYLOAD_INVALID,
                )
            lab = sl.get("label")
            if not isinstance(lab, str) or not lab.strip():
                raise WireValidationError(
                    f"{pbase}.slices[{j}].label must be a non-empty string",
                    code=ErrorCode.PAYLOAD_INVALID,
                )
            pj = _json_pct_int(sl, f"{pbase}.slices[{j}]", "percent")
            total_pct += pj
        if total_pct != 100:
            raise WireValidationError(
                f"{pbase}.slices percent values must sum to 100 "
                f"(got {total_pct})",
                code=ErrorCode.PAYLOAD_INVALID,
            )


def _health_activity_nonneg_points(
    h: dict[str, Any],
    *,
    base: str,
    field: str,
) -> list[float]:
    pts = h.get(field)
    if not isinstance(pts, list) or len(pts) != 24:
        raise WireValidationError(
            f"{base}.{field} must be a list of length 24",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    out: list[float] = []
    for i, p in enumerate(pts):
        if type(p) is bool or not isinstance(p, (int, float)):
            raise WireValidationError(
                f"{base}.{field}[{i}] must be a number",
                code=ErrorCode.PAYLOAD_INVALID,
            )
        if isinstance(p, float) and not math.isfinite(p):
            raise WireValidationError(
                f"{base}.{field}[{i}] must be a finite number",
                code=ErrorCode.PAYLOAD_INVALID,
            )
        try:
            fv = float(p)
        except (OverflowError, ValueError):
            raise WireValidationError(
                f"{base}.{field}[{i}] must be a representable finite number",
                code=ErrorCode.PAYLOAD_INVALID,
            ) from None
        if fv < 0:
            raise WireValidationError(
                f"{base}.{field}[{i}] must be non-negative",
                code=ErrorCode.PAYLOAD_INVALID,
            )
        out.append(fv)
    return out


def _health_activity_aux_label(h: dict[str, Any], *, base: str, field: str) -> str:
    v = h.get(field)
    if not isinstance(v, str):
        raise WireValidationError(
            f"{base}.{field} must be a string",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    s = v.strip()
    if not s:
        raise WireValidationError(
            f"{base}.{field} must be a non-empty string",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    if len(s) > _MODULE_STATE_DETAIL_AUX_LABEL_MAX_LEN:
        mx = _MODULE_STATE_DETAIL_AUX_LABEL_MAX_LEN
        raise WireValidationError(
            f"{base}.{field} must be at most {mx} characters",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return s


def _normalize_module_state_detail_json(detail_raw: str) -> tuple[str, list[str]]:
    """Parse ``detail`` JSON, validate dashboard metrics schema v2.

    Returns compact JSON text for storage and any soft warnings (e.g. stripped keys).
    """
    s = detail_raw.strip()
    if not s:
        raise WireValidationError(
            "payload.detail is required (JSON dashboard metrics, schema_version 2)",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    if len(s) > _MAX_MODULE_STATE_DETAIL_CHARS:
        mx = _MAX_MODULE_STATE_DETAIL_CHARS
        raise WireValidationError(
            f"payload.detail must be at most {mx} characters",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    try:
        root: Any = json.loads(s)
    except json.JSONDecodeError as e:
        raise WireValidationError(
            f"payload.detail must be valid JSON: {e}",
            code=ErrorCode.PAYLOAD_INVALID,
        ) from e
    if not isinstance(root, dict):
        raise WireValidationError(
            "payload.detail JSON must be an object",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    # ``bool`` is a distinct type, but ``True == 1`` — reject booleans explicitly.
    sv = root.get("schema_version")
    if type(sv) is not int or sv != _MODULE_STATE_DETAIL_SCHEMA_VERSION:
        ver = _MODULE_STATE_DETAIL_SCHEMA_VERSION
        raise WireValidationError(
            f"payload.detail.schema_version must be integer {ver}",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    metrics = root.get("metrics")
    if not isinstance(metrics, dict):
        raise WireValidationError(
            "payload.detail.metrics must be an object",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    for mk in _MODULE_STATE_DETAIL_METRIC_KEYS:
        _json_nonneg_int(metrics, "payload.detail.metrics", mk)
    vs = root.get("validator_status_pct")
    if not isinstance(vs, dict):
        raise WireValidationError(
            "payload.detail.validator_status_pct must be an object",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    a = _json_pct_int(vs, "payload.detail.validator_status_pct", "active")
    b = _json_pct_int(vs, "payload.detail.validator_status_pct", "passive")
    c = _json_pct_int(vs, "payload.detail.validator_status_pct", "offline")
    if a + b + c != 100:
        raise WireValidationError(
            "payload.detail.validator_status_pct must sum to 100",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    ha = root.get("health_activity_24h")
    if not isinstance(ha, dict):
        raise WireValidationError(
            "payload.detail.health_activity_24h must be an object",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    ha_warnings: list[str] = []
    unknown_ha_keys = sorted(set(ha.keys()) - _HEALTH_ACTIVITY_24H_ALLOWED_KEYS)
    for uk in unknown_ha_keys:
        ha_warnings.append(
            "Removed unsupported payload.detail.health_activity_24h "
            f"field {uk!r}",
        )
    ha_clean = {k: ha[k] for k in ha if k in _HEALTH_ACTIVITY_24H_ALLOWED_KEYS}
    hbase = "payload.detail.health_activity_24h"
    gh = ha_clean.get("granularity_hours")
    if type(gh) is not int or gh != 1:
        raise WireValidationError(
            f"{hbase}.granularity_hours must be integer 1",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    jobs_points = _health_activity_nonneg_points(
        ha_clean,
        base=hbase,
        field="jobs_points",
    )
    aux1_label = _health_activity_aux_label(
        ha_clean,
        base=hbase,
        field="aux1_label",
    )
    aux1_points = _health_activity_nonneg_points(
        ha_clean,
        base=hbase,
        field="aux1_points",
    )
    aux2_label = _health_activity_aux_label(
        ha_clean,
        base=hbase,
        field="aux2_label",
    )
    aux2_points = _health_activity_nonneg_points(
        ha_clean,
        base=hbase,
        field="aux2_points",
    )
    root["health_activity_24h"] = {
        "aux1_label": aux1_label,
        "aux1_points": aux1_points,
        "aux2_label": aux2_label,
        "aux2_points": aux2_points,
        "granularity_hours": 1,
        "jobs_points": jobs_points,
    }
    _validate_module_state_dashboard_cards(root)
    _validate_module_state_dashboard_pies(root)
    if "notes" in root and root["notes"] is not None:
        if not isinstance(root["notes"], str):
            raise WireValidationError(
                "payload.detail.notes must be a string or omitted",
                code=ErrorCode.PAYLOAD_INVALID,
            )
    normalized = json.dumps(root, separators=(",", ":"), sort_keys=True)
    if len(normalized) > _MAX_MODULE_STATE_DETAIL_CHARS:
        raise WireValidationError(
            f"payload.detail must be at most {_MAX_MODULE_STATE_DETAIL_CHARS} "
            "characters after normalization",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return normalized, ha_warnings


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
    """Point legacy single-route JSON at the primary row (first by priority, id).

    When no dials remain, clear core's singleton row or reset the module's
    ``route_json`` to ``{}`` so ``get_module_route`` / lookup stay consistent.
    """
    rows = DialRouteEntryRepository(conn).list_by_scope(scope)
    if not rows:
        if is_core:
            CoreAdvertisedRouteRepository(conn).delete_singleton()
        else:
            assert module_row_name is not None
            ModulesRepository(conn).update_route_json(
                module_name=module_row_name,
                route_json=canonical_json_str({}),
            )
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
    """Strip, validate apex name (≤1 dot), return lowercase canonical module id."""
    raw = require_str(p, field).strip()
    if not raw:
        raise WireValidationError(
            f"{field} must not be empty",
            code=ErrorCode.INVALID_MODULE_NAME,
        )
    apex = validate_modulr_core_registry_apex_name(
        raw,
        field_label=field,
        invalid_code=ErrorCode.INVALID_MODULE_NAME,
    )
    return normalize_module_name(apex)


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


def handle_get_protocol_methods(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    """
    Handle ``get_protocol_methods``: return the protocol-surface method catalog.

    Each ``methods`` entry includes ``method``, ``category``, ``group``,
    ``summary``, ``description`` (length-capped in the static catalog),
    ``payload_contract``, and ``protocol_surface``. The list is sorted by
    ``method`` name. This surface is smaller than the full Core catalog from
    ``get_module_methods`` for ``modulr.core``.

    Args:
        validated: Inbound message after signature verification and structural
            validation (envelope + operation routing).
        settings: Active Core configuration; unused here but required so all
            operation handlers share the same call shape.
        conn: SQLite connection to Core's database; unused for this read-only
            metadata response.
        clock: Monotonic/epoch clock used when building the success envelope.

    Returns:
        Success envelope JSON: ``operation_response``
        ``get_protocol_methods_response``, ``PROTOCOL_METHODS_RETURNED``, and
        ``payload`` with ``catalog_schema_version``, ``methods``, ``method_count``.

    Raises:
        WireValidationError: If ``payload`` is not an empty object
            (``PAYLOAD_INVALID``).
    """
    del settings, conn
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    if p:
        raise WireValidationError(
            "get_protocol_methods expects an empty payload object",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="get_protocol_methods_response",
        success_code=SuccessCode.PROTOCOL_METHODS_RETURNED,
        detail="Protocol method catalog.",
        payload=build_protocol_methods_payload(),
        clock=clock,
    )


def handle_get_core_genesis_branding(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    """
    Return persisted genesis branding for this Core instance (signed wire).

    Same fields as ``GET /genesis/branding``: root org SVG, bootstrap operator
    profile image (base64 + MIME), labels, and ``genesis_complete``.
    """
    del settings
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    if p:
        raise WireValidationError(
            "get_core_genesis_branding expects an empty payload object",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    body = genesis_branding_payload(conn=conn)
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="get_core_genesis_branding_response",
        success_code=SuccessCode.CORE_GENESIS_BRANDING_RETURNED,
        detail="Core genesis branding snapshot.",
        payload=body,
        clock=clock,
    )


def handle_get_module_methods(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    """
    Handle ``get_module_methods``: return a wire method catalog or an empty list.

    For ``modulr.core``, returns the full static Core catalog (same entry shape
    as ``get_protocol_methods``, plus coordination methods). Rows include
    ``protocol_surface`` where the method is shared network-wide—not every entry
    is Core-only coordination. For a registered module without a stored manifest,
    returns ``methods`` as ``[]`` with ``catalog_schema_version`` and
    ``module_id``.

    Args:
        validated: Inbound message after signature verification and structural
            validation.
        settings: Active Core configuration; unused but kept for handler
            signature consistency.
        conn: SQLite connection; used to resolve registered modules and to
            detect unknown ``module_id``.
        clock: Time source for the success envelope ``timestamp``.

    Returns:
        Success envelope with ``get_module_methods_response`` and
        ``MODULE_METHODS_RETURNED``. Payload includes ``catalog_schema_version``,
        ``module_id``, ``methods`` (list of catalog dicts or empty), and
        ``method_count``.

    Raises:
        WireValidationError: If ``module_id`` is missing, empty, or not a valid
            dotted name (``INVALID_MODULE_NAME``), or if the module is not
            registered (``MODULE_NOT_FOUND``).
    """
    del settings
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    module_id = _parse_wire_module_name(p, field="module_id")
    if module_id == CANONICAL_CORE_MODULE_NAME:
        return success_response_envelope(
            request_message_id=env["message_id"],
            operation_response="get_module_methods_response",
            success_code=SuccessCode.MODULE_METHODS_RETURNED,
            detail=(
                "Full wire catalog for modulr.core "
                "(coordination + protocol surface)."
            ),
            payload=build_core_module_methods_payload(module_id=module_id),
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
        operation_response="get_module_methods_response",
        success_code=SuccessCode.MODULE_METHODS_RETURNED,
        detail="No method manifest stored for this module.",
        payload={
            "catalog_schema_version": CATALOG_SCHEMA_VERSION,
            "module_id": module_id,
            "methods": [],
            "method_count": 0,
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
                conn=conn,
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


def handle_remove_module_route(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    """Delete one dial for ``(scope, route_type, route)``; sync legacy route JSON."""
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
    now_ts = int(clock())
    dial_repo = DialRouteEntryRepository(conn)

    if module_id == CANONICAL_CORE_MODULE_NAME:
        require_bootstrap_sender(
            settings=settings,
            conn=conn,
            sender_public_key_hex=env["sender_public_key"],
        )
        deleted = dial_repo.delete_by_scope_and_dial(
            scope=CANONICAL_CORE_MODULE_NAME,
            route_type=route_type,
            route=route,
        )
        if not deleted:
            raise WireValidationError(
                "no matching dial for modulr.core",
                code=ErrorCode.DIAL_NOT_FOUND,
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
            operation_response="remove_module_route_response",
            success_code=SuccessCode.MODULE_ROUTE_REMOVED,
            detail="Modulr.Core dial removed.",
            payload={
                "module_id": CANONICAL_CORE_MODULE_NAME,
                "route_type": route_type,
                "route": route,
            },
            clock=clock,
        )

    mod_row = ModulesRepository(conn).get_by_name(module_id)
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
    deleted = dial_repo.delete_by_scope_and_dial(
        scope=scope,
        route_type=route_type,
        route=route,
    )
    if not deleted:
        raise WireValidationError(
            f"no matching dial for module {module_id!r}",
            code=ErrorCode.DIAL_NOT_FOUND,
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
        operation_response="remove_module_route_response",
        success_code=SuccessCode.MODULE_ROUTE_REMOVED,
        detail="Module dial removed.",
        payload={
            "module_id": canonical_name,
            "route_type": route_type,
            "route": route,
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
        conn=conn,
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
        conn=conn,
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
        conn=conn,
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


def handle_report_module_state(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    """
    Store the latest lifecycle snapshot for a registered module.

    Requires ``module_id``, ``state_phase`` (running, syncing, degraded,
    maintenance), and ``detail``: a JSON object (``schema_version`` 2) with
    dashboard-oriented metrics (user/subscriber/validator/provider/job counts,
    validator status percentages, 24 hourly jobs plus two labeled auxiliary
    series). The sender Ed25519
    key must match the module's registered ``signing_public_key``.

    Args:
        validated: Verified inbound envelope and signing preimage.
        settings: Runtime settings (unused; reserved for policy hooks).
        conn: Open SQLite connection.
        clock: Monotonic/epoch clock for ``reported_at``.

    Returns:
        Success response envelope with ``module_id``, ``state_phase``, ``detail``,
        and ``reported_at``.

    Raises:
        WireValidationError: Unknown module, identity mismatch, invalid phase,
            invalid or missing ``detail`` JSON, or detail too large.
    """
    del settings
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    module_id = _parse_wire_module_name(p, field="module_id")
    phase_raw = require_str(p, "state_phase").lower()
    if phase_raw not in _MODULE_STATE_PHASES:
        raise WireValidationError(
            f"payload.state_phase must be one of {sorted(_MODULE_STATE_PHASES)}",
            code=ErrorCode.INVALID_STATUS,
        )
    detail_in = require_str(p, "detail")
    detail, detail_warnings = _normalize_module_state_detail_json(detail_in)

    modules = ModulesRepository(conn)
    mod_row = modules.get_by_name(module_id)
    if mod_row is None:
        raise WireValidationError(
            f"module {module_id!r} is not registered",
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
    reported_at = int(clock())
    ModuleStateSnapshotRepository(conn).upsert(
        module_name=canonical_name,
        state_phase=phase_raw,
        detail=detail,
        reported_at=reported_at,
    )
    out_payload: dict[str, Any] = {
        "module_id": canonical_name,
        "state_phase": phase_raw,
        "detail": detail,
        "reported_at": reported_at,
    }
    if detail_warnings:
        out_payload["warnings"] = detail_warnings
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="report_module_state_response",
        success_code=SuccessCode.MODULE_STATE_REPORTED,
        detail="Module state recorded.",
        payload=out_payload,
        clock=clock,
    )


def handle_get_module_state(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    """
    Return the latest stored ``report_module_state`` snapshot for ``module_id``.

    For ``modulr.core`` succeeds even though the coordination module has no
    ``modules`` row; payload fields are JSON null when no snapshot exists.
    Other ``module_id`` values require a registered module.

    Args:
        validated: Verified inbound envelope and signing preimage.
        settings: Runtime settings (unused).
        conn: Open SQLite connection.
        clock: Response timestamp source.

    Returns:
        Success envelope with ``module_id``, ``state_phase``, ``detail``, and
        ``reported_at`` (each null when never reported).

    Raises:
        WireValidationError: ``module_id`` missing/invalid or unknown module
            (except built-in ``modulr.core``).
    """
    del settings
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    module_id = _parse_wire_module_name(p, field="module_id")
    if module_id == CANONICAL_CORE_MODULE_NAME:
        canonical = CANONICAL_CORE_MODULE_NAME
    else:
        row = ModulesRepository(conn).get_by_name(module_id)
        if row is None:
            raise WireValidationError(
                f"module {module_id!r} not found",
                code=ErrorCode.MODULE_NOT_FOUND,
            )
        canonical = str(row["module_name"])

    snap = ModuleStateSnapshotRepository(conn).get_by_module_name(canonical)
    out_payload: dict[str, Any] = {
        "module_id": canonical,
        "state_phase": snap["state_phase"] if snap else None,
        "detail": snap["detail"] if snap else None,
        "reported_at": snap["reported_at"] if snap else None,
    }
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="get_module_state_response",
        success_code=SuccessCode.MODULE_STATE_SNAPSHOT_RETURNED,
        detail="Module state returned.",
        payload=out_payload,
        clock=clock,
    )

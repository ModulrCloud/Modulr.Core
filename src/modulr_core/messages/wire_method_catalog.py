"""Static wire method metadata for discovery responses (modulr.core catalog).

``summary`` is one-line UI/docs text. ``description`` is longer but capped by
``MAX_METHOD_DESCRIPTION_LENGTH`` so payloads stay bounded.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final

MAX_METHOD_SUMMARY_LENGTH: Final = 200
MAX_METHOD_DESCRIPTION_LENGTH: Final = 480
CATALOG_SCHEMA_VERSION: Final = 1


@dataclass(frozen=True, slots=True)
class WireMethodCatalogEntry:
    """One wire method as advertised to clients (discovery / tooling)."""

    method: str
    category: str
    group: str
    summary: str
    description: str
    payload_contract: str
    protocol_surface: bool


def _e(
    method: str,
    *,
    category: str,
    group: str,
    summary: str,
    description: str,
    payload_contract: str,
    protocol_surface: bool = False,
) -> WireMethodCatalogEntry:
    return WireMethodCatalogEntry(
        method=method,
        category=category,
        group=group,
        summary=summary,
        description=description,
        payload_contract=payload_contract,
        protocol_surface=protocol_surface,
    )


_CORE_WIRE_METHOD_ENTRIES: tuple[WireMethodCatalogEntry, ...] = (
    _e(
        "get_protocol_version",
        category="protocol",
        group="version",
        summary="Return the wire protocol version string Core accepts.",
        description=(
            "Callers use this to negotiate compatibility before relying on other "
            "operations. The inbound payload must be an empty JSON object. The "
            "response includes the active protocol_version Core is speaking."
        ),
        payload_contract="empty_object",
        protocol_surface=True,
    ),
    _e(
        "get_protocol_methods",
        category="protocol",
        group="discovery",
        summary="Return metadata for protocol-level wire methods.",
        description=(
            "Lists methods every participating stack should treat as shared protocol "
            "surface (version, discovery of this list, liveness). Payload must be "
            "empty. Each entry includes category, group, summary, and description."
        ),
        payload_contract="empty_object",
        protocol_surface=True,
    ),
    _e(
        "get_module_methods",
        category="validator",
        group="discovery",
        summary="List wire methods advertised for a module (Core or registered).",
        description=(
            "For modulr.core returns the full coordination catalog with metadata. "
            "For other modules returns manifest-backed methods when stored, else "
            "empty. Requires module_id in the payload."
        ),
        payload_contract="module_id",
    ),
    _e(
        "submit_module_route",
        category="validator",
        group="routing",
        summary="Publish or update how Core reaches a module (dial / route table).",
        description=(
            "Modules submit route_type and route plus module_id; mode controls "
            "merge vs replace. Signing rules depend on module vs modulr.core and "
            "bootstrap policy. Used so clients resolve modules without assuming IPv4."
        ),
        payload_contract="module_route_submit",
    ),
    _e(
        "remove_module_route",
        category="validator",
        group="routing",
        summary="Remove one stored dial matching module_id, route_type, and route.",
        description=(
            "Deletes a single route row when it matches exactly. Registered modules "
            "sign with the module key; modulr.core may require bootstrap keys when "
            "not in dev_mode."
        ),
        payload_contract="module_route_remove",
    ),
    _e(
        "get_module_route",
        category="validator",
        group="routing",
        summary="Read back a module's route document and dial summary.",
        description=(
            "Returns route_detail and flattened route fields when present. For "
            "modulr.core may include validator-oriented extras. Requires module_id."
        ),
        payload_contract="module_id",
    ),
    _e(
        "register_module",
        category="validator",
        group="registration",
        summary="Register a new module identity, signing key, and route hints.",
        description=(
            "Bootstrap-gated in production. Establishes the module_name and keys "
            "Core will honor for subsequent signed operations from that module."
        ),
        payload_contract="register_module",
    ),
    _e(
        "lookup_module",
        category="validator",
        group="discovery",
        summary="Resolve a module name to registration and availability metadata.",
        description=(
            "Read-only lookup by module_name. Returns MODULE_NOT_FOUND when the "
            "name is unknown. Used by clients and tooling before dialing routes."
        ),
        payload_contract="lookup_module",
    ),
    _e(
        "register_name",
        category="validator",
        group="naming",
        summary="Reserve or update a human-facing name handle under policy.",
        description=(
            "Participates in the naming plane alongside org resolution. Payload "
            "shape and authorization follow Core naming rules for the deployment."
        ),
        payload_contract="register_name",
    ),
    _e(
        "register_org",
        category="validator",
        group="naming",
        summary="Register an organization key for later resolution and policy.",
        description=(
            "Claims an organization identifier subject to bootstrap and network "
            "rules. Pairs with resolve_name and reverse_resolve_name for discovery."
        ),
        payload_contract="register_org",
    ),
    _e(
        "resolve_name",
        category="validator",
        group="naming",
        summary="Map a name or org-style query to resolved records.",
        description=(
            "Forward resolution from handles or org labels to targets Core stores. "
            "Used by apps to find peers without hard-coded endpoints."
        ),
        payload_contract="resolve_name",
    ),
    _e(
        "reverse_resolve_name",
        category="validator",
        group="naming",
        summary="Map an address or public key back to bound names or orgs.",
        description=(
            "Inverse of resolve_name for explorers and audit surfaces. Payload "
            "identifies the address or key to look up."
        ),
        payload_contract="reverse_resolve_name",
    ),
    _e(
        "heartbeat_update",
        category="protocol",
        group="liveness",
        summary="Lightweight liveness and optional note for a connected module.",
        description=(
            "Keeps availability signals cheap compared to full state sync. Carries "
            "module_id and optional note; validators and UIs may aggregate these "
            "signals for health views."
        ),
        payload_contract="heartbeat_update",
        protocol_surface=True,
    ),
)

CORE_WIRE_METHOD_CATALOG: dict[str, WireMethodCatalogEntry] = {
    e.method: e for e in _CORE_WIRE_METHOD_ENTRIES
}


def _validate_catalog() -> None:
    seen: set[str] = set()
    for e in _CORE_WIRE_METHOD_ENTRIES:
        assert e.method not in seen, f"duplicate catalog method: {e.method}"
        seen.add(e.method)
        if len(e.summary) > MAX_METHOD_SUMMARY_LENGTH:
            raise AssertionError(f"summary too long for {e.method}: {len(e.summary)}")
        if len(e.description) > MAX_METHOD_DESCRIPTION_LENGTH:
            raise AssertionError(
                f"description too long for {e.method}: {len(e.description)}",
            )


_validate_catalog()


def core_operation_names() -> frozenset[str]:
    return frozenset(CORE_WIRE_METHOD_CATALOG.keys())


def protocol_operation_names() -> frozenset[str]:
    return frozenset(
        e.method for e in CORE_WIRE_METHOD_CATALOG.values() if e.protocol_surface
    )


def entry_to_payload_dict(entry: WireMethodCatalogEntry) -> dict[str, str | bool]:
    return {
        "method": entry.method,
        "category": entry.category,
        "group": entry.group,
        "summary": entry.summary,
        "description": entry.description,
        "payload_contract": entry.payload_contract,
        "protocol_surface": entry.protocol_surface,
    }


def build_protocol_methods_payload() -> dict[str, Any]:
    rows = sorted(
        (e for e in CORE_WIRE_METHOD_CATALOG.values() if e.protocol_surface),
        key=lambda x: x.method,
    )
    methods = [entry_to_payload_dict(e) for e in rows]
    return {
        "catalog_schema_version": CATALOG_SCHEMA_VERSION,
        "method_count": len(methods),
        "methods": methods,
    }


def build_core_module_methods_payload(*, module_id: str) -> dict[str, Any]:
    rows = sorted(CORE_WIRE_METHOD_CATALOG.values(), key=lambda x: x.method)
    methods = [entry_to_payload_dict(e) for e in rows]
    return {
        "catalog_schema_version": CATALOG_SCHEMA_VERSION,
        "module_id": module_id,
        "method_count": len(methods),
        "methods": methods,
    }

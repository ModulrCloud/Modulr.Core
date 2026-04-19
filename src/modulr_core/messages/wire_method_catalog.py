"""Static wire method metadata for Core discovery responses.

Drives ``CORE_OPERATIONS`` and ``PROTOCOL_METHOD_OPERATIONS`` in
``messages.constants``. Each entry becomes a JSON object on the wire; lengths
are enforced at import via ``MAX_METHOD_SUMMARY_LENGTH`` and
``MAX_METHOD_DESCRIPTION_LENGTH``.
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
    """Construct a frozen catalog row (internal table builder)."""
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
        "get_core_genesis_branding",
        category="protocol",
        group="genesis",
        summary=(
            "Return Modulr.Core genesis branding: org SVG logo and operator profile."
        ),
        description=(
            "modulr.core only. Signed read of the same data as GET /genesis/branding: "
            "genesis_complete, root_organization_label, "
            "bootstrap_operator_display_name, root_organization_logo_svg (markup), "
            "operator_profile_image_base64, operator_profile_image_mime. Inbound "
            "payload must be an empty JSON object."
        ),
        payload_contract="empty_object",
        protocol_surface=True,
    ),
    _e(
        "get_organization_logo",
        category="protocol",
        group="branding",
        summary="Return an org brand logo (SVG) by org name or org Ed25519 pubkey.",
        description=(
            "Exactly one of organization_key (single-label or dotted org domain) or "
            "organization_signing_public_key_hex. Returns logo_svg. Matches genesis "
            "root org when identifiers align; else uses entity_profile_branding from "
            "set_organization_logo."
        ),
        payload_contract="organization_logo_get",
        protocol_surface=True,
    ),
    _e(
        "get_user_profile_image",
        category="protocol",
        group="branding",
        summary="Return a user profile image (base64 + MIME) by handle or user pubkey.",
        description=(
            "Provide exactly one of user_handle or user_signing_public_key_hex. "
            "Matches the bootstrap operator from genesis when identifiers align; "
            "otherwise returns rows stored by set_user_profile_image."
        ),
        payload_contract="user_profile_image_get",
        protocol_surface=True,
    ),
    _e(
        "get_user_description",
        category="protocol",
        group="branding",
        summary="Return the public user description (bio) by handle or user pubkey.",
        description=(
            "Provide exactly one of user_handle or user_signing_public_key_hex. "
            "Reads the centralized description stored by set_user_description on "
            "Core (not genesis metadata). Returns null description if the profile "
            "row exists but no bio was set."
        ),
        payload_contract="user_profile_image_get",
        protocol_surface=True,
    ),
    _e(
        "set_organization_logo",
        category="protocol",
        group="branding",
        summary="Create or replace an org SVG logo for the holder org public key.",
        description=(
            "Requires organization_signing_public_key_hex and logo_svg (or null to "
            "clear). Optional organization_key scopes the row. Sender must match the "
            "org key or be bootstrap; if organization_key is set and the sender is not "
            "bootstrap, Core requires name_bindings to bind that name to the org key. "
            "Updates genesis root org logo when this is the genesis root org."
        ),
        payload_contract="organization_logo_set",
        protocol_surface=True,
    ),
    _e(
        "set_user_profile_image",
        category="protocol",
        group="branding",
        summary="Create or replace a user profile image for the holder user pubkey.",
        description=(
            "Requires user_signing_public_key_hex; profile_image_base64 and "
            "profile_image_mime together or both null. Optional user_handle. Sender "
            "must match the user key or be bootstrap. Updates genesis operator image "
            "when the key is the bootstrap operator."
        ),
        payload_contract="user_profile_image_set",
        protocol_surface=True,
    ),
    _e(
        "set_user_description",
        category="protocol",
        group="branding",
        summary="Create or replace the public user description (bio) for a user pubkey.",
        description=(
            "Requires user_signing_public_key_hex; description is a trimmed string "
            "or null to clear (max length enforced on Core). Optional user_handle "
            "to mirror the row under h:<handle> as well as p:<pubkey>. Sender must "
            "match the user key or be bootstrap—same as set_user_profile_image."
        ),
        payload_contract="user_profile_image_set",
        protocol_surface=True,
    ),
    _e(
        "get_module_methods",
        category="validator",
        group="discovery",
        summary="List wire methods advertised for a module (Core or registered).",
        description=(
            "For modulr.core returns Core's full static catalog: coordination "
            "methods plus protocol_surface entries shared across the network—use "
            "protocol_surface on each row; not every listed method is Core-only. "
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
        summary="Register an organization apex and optional module surface on Core.",
        description=(
            "Bootstrap-gated. Always writes the apex to the name registry "
            "(organization_name, resolved_id, optional route/metadata). When "
            "signing_public_key is set, also registers the modules row for the same "
            "apex (requires route as a JSON object; optional module_version defaults "
            "to 1.0.0; module_capabilities / module_metadata for the module record). "
            "Pairs with resolve_name, reverse_resolve_name, and lookup_module."
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
            "module_name and optional note; validators and UIs may aggregate these "
            "signals for health views."
        ),
        payload_contract="heartbeat_update",
        protocol_surface=True,
    ),
    _e(
        "report_module_state",
        category="validator",
        group="telemetry",
        summary="Submit a lifecycle snapshot for a registered module.",
        description=(
            "Modules report state_phase (coarse lifecycle: running, syncing, "
            "degraded, maintenance) and required detail: JSON schema_version 2 "
            "(metrics, cards, pies, validator_status_pct sum 100, health_activity_24h: "
            "hourly jobs_points plus two labeled aux series, 24 non-negative points "
            "each). Sender must match module signing key. Liveness stays "
            "heartbeat_update; snapshot feeds homepage rollups."
        ),
        payload_contract="report_module_state",
        protocol_surface=True,
    ),
    _e(
        "get_module_state",
        category="validator",
        group="telemetry",
        summary="Read the latest state snapshot Core stored for a module.",
        description=(
            "Returns fields from the most recent report_module_state for "
            "module_id, or nulls when nothing was reported yet. Validators serve "
            "this read path; ids without a stored row return nulls. Used by "
            "explorers and dashboards without dialing the module."
        ),
        payload_contract="module_id",
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
    """
    All wire method names implemented by ``modulr.core`` on the catalog.

    Returns:
        Set of method name strings (matches keys of ``CORE_WIRE_METHOD_CATALOG``).
    """
    return frozenset(CORE_WIRE_METHOD_CATALOG.keys())


def protocol_operation_names() -> frozenset[str]:
    """
    Subset of methods that belong to the shared protocol surface.

    Returns:
        Set of ``method`` values where ``protocol_surface`` is true.
    """
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
    """
    Build the ``get_protocol_methods`` success ``payload`` body.

    Returns:
        Dict with ``catalog_schema_version``, ``method_count``, and ``methods``
        (sorted by ``method`` name, protocol surface only).
    """
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
    """
    Build the ``get_module_methods`` success ``payload`` for ``modulr.core``.

    Args:
        module_id: Canonical module id (expected ``modulr.core`` from the
            handler).

    Returns:
        Dict with ``catalog_schema_version``, ``module_id``, ``method_count``,
        and ``methods`` (full Core catalog, sorted by ``method`` name).
    """
    rows = sorted(CORE_WIRE_METHOD_CATALOG.values(), key=lambda x: x.method)
    methods = [entry_to_payload_dict(e) for e in rows]
    return {
        "catalog_schema_version": CATALOG_SCHEMA_VERSION,
        "module_id": module_id,
        "method_count": len(methods),
        "methods": methods,
    }

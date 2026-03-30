"""Wire constants for Modulr.Core inbound validation (MVP)."""

from __future__ import annotations

from modulr_core.version import MODULE_VERSION

TARGET_MODULE_CORE = "modulr.core"

CORE_OPERATIONS = frozenset({
    "get_protocol_version",
    "register_module",
    "lookup_module",
    "register_name",
    "register_org",
    "resolve_name",
    "reverse_resolve_name",
    "heartbeat_update",
})

SUPPORTED_SENDER_KEY_TYPE = "ed25519"
SUPPORTED_SIGNATURE_ALGORITHM = "ed25519"

SUPPORTED_PROTOCOL_VERSION = MODULE_VERSION

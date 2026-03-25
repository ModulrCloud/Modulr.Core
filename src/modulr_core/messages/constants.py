"""Wire constants for Modulr.Core inbound validation (MVP)."""

from __future__ import annotations

from modulr_core.version import MODULE_VERSION

TARGET_MODULE_CORE = "modulr.core"

CORE_OPERATIONS = frozenset({
    "register_module",
    "lookup_module",
    "resolve_name",
    "heartbeat_update",
})

SUPPORTED_SENDER_KEY_TYPE = "ed25519"
SUPPORTED_SIGNATURE_ALGORITHM = "ed25519"

SUPPORTED_PROTOCOL_VERSION = MODULE_VERSION

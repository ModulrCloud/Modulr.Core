"""Wire constants for Modulr.Core inbound validation (MVP)."""

from __future__ import annotations

from modulr_core.messages.wire_method_catalog import (
    core_operation_names,
    protocol_operation_names,
)
from modulr_core.version import MODULE_VERSION

TARGET_MODULE_CORE = "modulr.core"

CORE_OPERATIONS = core_operation_names()
PROTOCOL_METHOD_OPERATIONS = protocol_operation_names()

SUPPORTED_SENDER_KEY_TYPE = "ed25519"
SUPPORTED_SIGNATURE_ALGORITHM = "ed25519"

SUPPORTED_PROTOCOL_VERSION = MODULE_VERSION

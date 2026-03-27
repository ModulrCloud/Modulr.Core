"""JSON response bodies for the Modulr response envelope (MVP; no signature field)."""

from __future__ import annotations

import json
from typing import Any

from modulr_core.errors.codes import ErrorCode
from modulr_core.messages.constants import TARGET_MODULE_CORE
from modulr_core.validation import payload_hash
from modulr_core.version import MODULE_VERSION


def try_parse_message_id(body: bytes) -> str | None:
    """Best-effort ``message_id`` from UTF-8 JSON (for error envelopes)."""
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        return None
    try:
        parsed: Any = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    mid = parsed.get("message_id")
    return mid if isinstance(mid, str) else None


def error_response_envelope(
    *,
    code: ErrorCode,
    detail: str,
    message_id: str | None = None,
) -> dict[str, Any]:
    """Standard error-shaped JSON object (``status`` ``error``)."""
    mid = message_id
    payload: dict[str, Any] = {}
    return {
        "protocol_version": MODULE_VERSION,
        "message_id": mid,
        "correlation_id": mid,
        "target_module": TARGET_MODULE_CORE,
        "target_module_version": MODULE_VERSION,
        "operation": "error_response",
        "status": "error",
        "code": str(code),
        "detail": detail,
        "payload": payload,
        "payload_hash": payload_hash(payload),
    }


def placeholder_not_implemented_envelope(
    *,
    message_id: str | None,
    request_operation: str,
) -> dict[str, Any]:
    """501 placeholder until Phase I operation handlers exist."""
    mid = message_id
    payload: dict[str, Any] = {
        "request_operation": request_operation,
        "note": "Operation handlers are not implemented yet (Phase I).",
    }
    return {
        "protocol_version": MODULE_VERSION,
        "message_id": mid,
        "correlation_id": mid,
        "target_module": TARGET_MODULE_CORE,
        "target_module_version": MODULE_VERSION,
        "operation": f"{request_operation}_response",
        "status": "error",
        "code": str(ErrorCode.OPERATION_NOT_IMPLEMENTED),
        "detail": f"Operation {request_operation!r} is not implemented yet.",
        "payload": payload,
        "payload_hash": payload_hash(payload),
    }

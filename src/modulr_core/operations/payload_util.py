"""Extract and validate JSON object fields in operation payloads."""

from __future__ import annotations

from typing import Any

from modulr_core.errors.codes import ErrorCode
from modulr_core.errors.exceptions import WireValidationError


def require_str(d: dict[str, Any], key: str) -> str:
    v = d.get(key)
    if not isinstance(v, str) or not v.strip():
        raise WireValidationError(
            f"payload.{key} must be a non-empty string",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return v.strip()


def optional_str(d: dict[str, Any], key: str) -> str | None:
    v = d.get(key)
    if v is None:
        return None
    if not isinstance(v, str):
        raise WireValidationError(
            f"payload.{key} must be a string or null",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return v


def require_dict(d: dict[str, Any], key: str) -> dict[str, Any]:
    v = d.get(key)
    if not isinstance(v, dict):
        raise WireValidationError(
            f"payload.{key} must be a JSON object",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return v


def optional_dict(d: dict[str, Any], key: str) -> dict[str, Any] | None:
    v = d.get(key)
    if v is None:
        return None
    if not isinstance(v, dict):
        raise WireValidationError(
            f"payload.{key} must be a JSON object or null",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return v


def optional_json_value(d: dict[str, Any], key: str) -> Any | None:
    v = d.get(key)
    if v is None:
        return None
    if isinstance(v, (dict, list, str, int, float, bool)):
        return v
    raise WireValidationError(
        f"payload.{key} has unsupported JSON type",
        code=ErrorCode.PAYLOAD_INVALID,
    )

"""Extract and validate JSON object fields in operation payloads."""

from __future__ import annotations

from typing import Any

from modulr_core.errors.codes import ErrorCode
from modulr_core.errors.exceptions import InvalidHexEncoding, WireValidationError
from modulr_core.validation.hex_codec import decode_hex_fixed


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


def optional_int(d: dict[str, Any], key: str) -> int | None:
    """Return ``None`` if ``key`` is absent or JSON null; reject bool and float."""
    if key not in d:
        return None
    v = d[key]
    if v is None:
        return None
    if isinstance(v, bool) or not isinstance(v, int):
        raise WireValidationError(
            f"payload.{key} must be an integer or null",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return v


def optional_ed25519_public_key_hex(
    d: dict[str, Any],
    *,
    field: str = "endpoint_signing_public_key_hex",
) -> str | None:
    """Optional 64-char lowercase Ed25519 public key hex; null/absent → ``None``."""
    if field not in d:
        return None
    v = d[field]
    if v is None:
        return None
    if not isinstance(v, str) or not v.strip():
        raise WireValidationError(
            f"payload.{field} must be null or a non-empty hex string",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    s = v.strip().lower()
    try:
        decode_hex_fixed(s, byte_length=32)
    except InvalidHexEncoding as e:
        raise WireValidationError(
            f"payload.{field} is not valid Ed25519 public key hex: {e}",
            code=ErrorCode.PUBLIC_KEY_INVALID,
        ) from e
    return s

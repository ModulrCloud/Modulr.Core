"""Inbound message validation: size, JSON, envelope, crypto, dedup, bootstrap."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime
from typing import Any, NoReturn

from modulr_core.clock import EpochClock, now_epoch_seconds
from modulr_core.config.schema import Settings
from modulr_core.errors.codes import ErrorCode
from modulr_core.errors.exceptions import (
    InvalidHexEncoding,
    InvalidPublicKey,
    SignatureInvalid,
    WireValidationError,
)
from modulr_core.messages.constants import (
    CORE_OPERATIONS,
    SUPPORTED_PROTOCOL_VERSION,
    SUPPORTED_SENDER_KEY_TYPE,
    SUPPORTED_SIGNATURE_ALGORITHM,
    TARGET_MODULE_CORE,
)
from modulr_core.messages.types import ValidatedInbound
from modulr_core.repositories.message_dedup import MessageDedupRepository
from modulr_core.validation import (
    canonical_json_bytes,
    decode_hex_fixed,
    envelope_signing_bytes,
    payload_hash,
    verify_ed25519,
)

_REQUIRED_STRING_KEYS = frozenset({
    "protocol_version",
    "message_id",
    "target_module",
    "operation",
    "sender_id",
    "sender_key_type",
    "sender_public_key",
    "signature_algorithm",
})
_REQUIRED_KEYS = _REQUIRED_STRING_KEYS | {
    "timestamp",
    "expires_at",
    "payload",
    "payload_hash",
    "signature",
}

_DEDUP_RESULT_SUMMARY_VALIDATED = "validated"


def validate_inbound_request(
    body: bytes,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock | None = None,
) -> ValidatedInbound:
    """Parse and validate a raw HTTP body as a signed Modulr.Core envelope.

    On success, records the message in ``message_dedup`` when this is the first
    time ``message_id`` is seen (caller should :meth:`~sqlite3.Connection.commit`).
    If the same ``message_id`` and signing preimage were already recorded, sets
    :attr:`ValidatedInbound.is_replay` to ``True`` and does not insert again.

    Raises:
        WireValidationError: With ``.code`` set to the appropriate :class:`ErrorCode`.
    """
    now = (clock or now_epoch_seconds)()
    if len(body) > settings.max_http_body_bytes:
        _fail(
            "request body exceeds max_http_body_bytes "
            f"({settings.max_http_body_bytes})",
            ErrorCode.MESSAGE_TOO_LARGE,
        )

    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError as e:
        _fail(f"request body is not valid UTF-8: {e}", ErrorCode.MALFORMED_JSON)

    try:
        parsed: Any = json.loads(text)
    except json.JSONDecodeError as e:
        _fail(f"invalid JSON: {e}", ErrorCode.MALFORMED_JSON)

    if not isinstance(parsed, dict):
        _fail("top-level JSON value must be an object", ErrorCode.MALFORMED_ENVELOPE)

    envelope: dict[str, Any] = parsed
    _validate_envelope_shape(envelope)
    _validate_routing_and_protocol(envelope)
    _validate_key_algorithms(envelope)
    _validate_signature_present(envelope)

    payload = envelope["payload"]
    if not isinstance(payload, dict):
        _fail("payload must be a JSON object", ErrorCode.MALFORMED_ENVELOPE)

    pbytes = canonical_json_bytes(payload)
    if len(pbytes) > settings.max_payload_bytes:
        _fail(
            "canonical payload exceeds max_payload_bytes "
            f"({settings.max_payload_bytes})",
            ErrorCode.PAYLOAD_TOO_LARGE,
        )

    wire_hash = envelope["payload_hash"]
    if not isinstance(wire_hash, str) or not wire_hash:
        _fail("payload_hash must be a non-empty string", ErrorCode.INVALID_FIELD)
    try:
        expected_hex = payload_hash(payload)
    except (TypeError, ValueError) as e:
        _fail(f"cannot hash payload: {e}", ErrorCode.PAYLOAD_INVALID)
    if wire_hash != expected_hex:
        _fail(
            "payload_hash does not match canonical payload",
            ErrorCode.PAYLOAD_HASH_MISMATCH,
        )

    ts = _parse_instant(envelope["timestamp"], field="timestamp")
    exp = _parse_instant(envelope["expires_at"], field="expires_at")

    if exp <= ts:
        _fail("expires_at must be after timestamp", ErrorCode.INVALID_EXPIRY)

    window = exp - ts
    if window > settings.max_expiry_window_seconds:
        _fail(
            "expiry window exceeds max_expiry_window_seconds",
            ErrorCode.EXPIRY_WINDOW_TOO_LARGE,
        )

    if now > exp:
        _fail("message has expired", ErrorCode.MESSAGE_EXPIRED)

    skew = settings.future_timestamp_skew_seconds
    if ts > now + skew:
        _fail(
            "timestamp too far in the future",
            ErrorCode.TIMESTAMP_FUTURE_SKEW_EXCEEDED,
        )

    signing_preimage = envelope_signing_bytes(envelope)
    fingerprint = hashlib.sha256(signing_preimage).digest()

    pub_hex = envelope["sender_public_key"]
    sig_hex = envelope["signature"]
    try:
        pub_bytes = decode_hex_fixed(pub_hex, byte_length=32)
        sig_bytes = decode_hex_fixed(sig_hex, byte_length=64)
    except InvalidHexEncoding as e:
        _fail(str(e), ErrorCode.INVALID_FIELD)

    try:
        verify_ed25519(pub_bytes, signing_preimage, sig_bytes)
    except InvalidPublicKey as e:
        _fail(str(e), ErrorCode.PUBLIC_KEY_INVALID)
    except SignatureInvalid as e:
        _fail(str(e), ErrorCode.SIGNATURE_INVALID)

    _enforce_bootstrap(pub_hex, settings)

    is_replay = _apply_deduplication(
        conn,
        settings=settings,
        message_id=envelope["message_id"],
        fingerprint=fingerprint,
        now=now,
    )

    return ValidatedInbound(
        envelope=envelope,
        sender_public_key=pub_bytes,
        signing_preimage=signing_preimage,
        request_fingerprint=fingerprint,
        is_replay=is_replay,
    )


def _fail(message: str, code: ErrorCode) -> NoReturn:
    raise WireValidationError(message, code=code)


def _validate_envelope_shape(envelope: dict[str, Any]) -> None:
    missing = _REQUIRED_KEYS - envelope.keys()
    if missing:
        _fail(f"missing envelope keys: {sorted(missing)}", ErrorCode.MALFORMED_ENVELOPE)

    for key in _REQUIRED_STRING_KEYS:
        val = envelope[key]
        if not isinstance(val, str) or not val:
            _fail(f"{key} must be a non-empty string", ErrorCode.MALFORMED_ENVELOPE)


def _validate_routing_and_protocol(envelope: dict[str, Any]) -> None:
    if envelope["protocol_version"] != SUPPORTED_PROTOCOL_VERSION:
        _fail("unsupported protocol_version", ErrorCode.MODULE_VERSION_UNSUPPORTED)
    if envelope["target_module"] != TARGET_MODULE_CORE:
        _fail(
            f"target_module must be {TARGET_MODULE_CORE!r}",
            ErrorCode.TARGET_MODULE_MISMATCH,
        )
    if envelope["operation"] not in CORE_OPERATIONS:
        _fail(
            "unsupported operation for modulr.core MVP",
            ErrorCode.UNSUPPORTED_OPERATION,
        )

    tmv = envelope.get("target_module_version")
    if tmv is None:
        return
    if not isinstance(tmv, str):
        _fail("target_module_version must be a string or null", ErrorCode.INVALID_FIELD)
    if tmv != SUPPORTED_PROTOCOL_VERSION:
        _fail("unsupported target_module_version", ErrorCode.MODULE_VERSION_UNSUPPORTED)


def _validate_key_algorithms(envelope: dict[str, Any]) -> None:
    if envelope["sender_key_type"] != SUPPORTED_SENDER_KEY_TYPE:
        _fail(
            f"sender_key_type must be {SUPPORTED_SENDER_KEY_TYPE!r}",
            ErrorCode.INVALID_FIELD,
        )
    if envelope["signature_algorithm"] != SUPPORTED_SIGNATURE_ALGORITHM:
        _fail(
            f"signature_algorithm must be {SUPPORTED_SIGNATURE_ALGORITHM!r}",
            ErrorCode.INVALID_FIELD,
        )


def _validate_signature_present(envelope: dict[str, Any]) -> None:
    sig = envelope["signature"]
    if sig is None:
        _fail("signature is required", ErrorCode.SIGNATURE_MISSING)
    if sig == "":
        _fail("signature must not be empty", ErrorCode.SIGNATURE_MISSING)
    if not isinstance(sig, str):
        _fail("signature must be a string", ErrorCode.SIGNATURE_MISSING)


def _parse_instant(value: Any, *, field: str) -> float:
    if isinstance(value, bool):
        _fail(f"{field} has invalid type", ErrorCode.INVALID_FIELD)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            _fail(f"{field} must not be empty", ErrorCode.INVALID_FIELD)
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(s)
        except ValueError as e:
            _fail(
                f"{field} is not a valid ISO 8601 timestamp: {e}",
                ErrorCode.INVALID_FIELD,
            )
        if dt.tzinfo is None:
            _fail(
                f"{field} must include a timezone offset or Z suffix",
                ErrorCode.INVALID_FIELD,
            )
        return dt.timestamp()
    _fail(f"{field} must be a string or number", ErrorCode.INVALID_FIELD)


def _enforce_bootstrap(sender_public_key_hex: str, settings: Settings) -> None:
    allowed = settings.bootstrap_public_keys
    if not allowed and settings.dev_mode:
        return
    if sender_public_key_hex not in allowed:
        _fail("sender is not authorized (bootstrap policy)", ErrorCode.UNAUTHORIZED)


def _apply_deduplication(
    conn: sqlite3.Connection,
    *,
    settings: Settings,
    message_id: str,
    fingerprint: bytes,
    now: float,
) -> bool:
    repo = MessageDedupRepository(conn)
    cutoff = int(now) - settings.replay_window_seconds
    repo.delete_older_than(cutoff)

    row = repo.get_by_message_id(message_id)
    if row is None:
        repo.insert(
            message_id=message_id,
            request_fingerprint=fingerprint,
            result_summary=_DEDUP_RESULT_SUMMARY_VALIDATED,
            first_seen_at=int(now),
        )
        return False

    stored = row["request_fingerprint"]
    if isinstance(stored, memoryview):
        stored = stored.tobytes()
    if stored != fingerprint:
        _fail(
            "message_id already used with a different request body",
            ErrorCode.MESSAGE_ID_CONFLICT,
        )
    return True

"""Phase G: inbound message validation pipeline."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from modulr_core import MODULE_VERSION, ErrorCode, WireValidationError
from modulr_core.config.schema import Settings
from modulr_core.messages import ValidatedInbound, validate_inbound_request
from modulr_core.persistence import apply_migrations, connect_memory
from modulr_core.validation import envelope_signing_bytes, payload_hash


def _settings(**overrides: Any) -> Settings:
    base = Settings(
        bootstrap_public_keys=(),
        database_path=Path("unused.sqlite"),
        max_http_body_bytes=2_097_152,
        max_payload_bytes=1_048_576,
        max_expiry_window_seconds=604_800,
        future_timestamp_skew_seconds=300,
        replay_window_seconds=86_400,
        dev_mode=True,
    )
    return replace(base, **overrides)


def _conn() -> sqlite3.Connection:
    c = connect_memory()
    apply_migrations(c)
    return c


def _signed_body(
    *,
    private_key: Ed25519PrivateKey,
    message_id: str,
    payload: dict | None = None,
    operation: str = "lookup_module",
    ts: float = 1_700_000_000.0,
    exp: float = 1_700_000_300.0,
    extra: dict | None = None,
) -> bytes:
    payload = payload if payload is not None else {"module_name": "modulr.storage"}
    pub = private_key.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    env: dict = {
        "protocol_version": MODULE_VERSION,
        "message_id": message_id,
        "target_module": "modulr.core",
        "operation": operation,
        "sender_id": "user:test",
        "sender_key_type": "ed25519",
        "sender_public_key": pub.hex(),
        "timestamp": ts,
        "expires_at": exp,
        "payload": payload,
        "payload_hash": payload_hash(payload),
        "signature_algorithm": "ed25519",
    }
    if extra:
        env.update(extra)
    preimage = envelope_signing_bytes(env)
    sig = private_key.sign(preimage)
    env["signature"] = sig.hex()
    return json.dumps(env).encode("utf-8")


def test_happy_path() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(private_key=pk, message_id="msg-happy-1")
    conn = _conn()
    r = validate_inbound_request(
        body,
        settings=_settings(),
        conn=conn,
        clock=lambda: 1_700_000_010.0,
    )
    assert isinstance(r, ValidatedInbound)
    assert r.is_replay is False
    assert r.envelope["message_id"] == "msg-happy-1"
    conn.commit()
    r2 = validate_inbound_request(
        body,
        settings=_settings(),
        conn=conn,
        clock=lambda: 1_700_000_010.0,
    )
    assert r2.is_replay is True


def test_message_too_large() -> None:
    with pytest.raises(WireValidationError, match="max_http_body_bytes") as ei:
        validate_inbound_request(
            b"x" * 100,
            settings=_settings(max_http_body_bytes=10),
            conn=_conn(),
            clock=lambda: 1.0,
        )
    assert ei.value.code is ErrorCode.MESSAGE_TOO_LARGE


def test_malformed_json() -> None:
    with pytest.raises(WireValidationError, match="invalid JSON"):
        validate_inbound_request(
            b"{",
            settings=_settings(),
            conn=_conn(),
            clock=lambda: 1.0,
        )


def test_utf8_body() -> None:
    with pytest.raises(WireValidationError, match="UTF-8"):
        validate_inbound_request(
            b"\xff",
            settings=_settings(),
            conn=_conn(),
            clock=lambda: 1.0,
        )


def test_payload_hash_mismatch() -> None:
    pk = Ed25519PrivateKey.generate()
    pub = pk.public_key().public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw)
    payload = {"a": 1}
    env = {
        "protocol_version": MODULE_VERSION,
        "message_id": "msg-bad-hash",
        "target_module": "modulr.core",
        "operation": "lookup_module",
        "sender_id": "user:test",
        "sender_key_type": "ed25519",
        "sender_public_key": pub.hex(),
        "timestamp": 1_700_000_000.0,
        "expires_at": 1_700_000_300.0,
        "payload": payload,
        "payload_hash": "0" * 64,
        "signature_algorithm": "ed25519",
    }
    preimage = envelope_signing_bytes({**env, "signature": ""})
    env["signature"] = pk.sign(preimage).hex()
    body = json.dumps(env).encode("utf-8")

    with pytest.raises(WireValidationError, match="payload_hash"):
        validate_inbound_request(
            body,
            settings=_settings(),
            conn=_conn(),
            clock=lambda: 1_700_000_010.0,
        )


def test_signature_wrong_key() -> None:
    pk1 = Ed25519PrivateKey.generate()
    pk2 = Ed25519PrivateKey.generate()
    env_no_sig = {
        "protocol_version": MODULE_VERSION,
        "message_id": "msg-wrong-sig",
        "target_module": "modulr.core",
        "operation": "lookup_module",
        "sender_id": "user:test",
        "sender_key_type": "ed25519",
        "sender_public_key": pk1.public_key()
        .public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw)
        .hex(),
        "timestamp": 1_700_000_000.0,
        "expires_at": 1_700_000_300.0,
        "payload": {"x": 1},
        "payload_hash": payload_hash({"x": 1}),
        "signature_algorithm": "ed25519",
    }
    preimage = envelope_signing_bytes(env_no_sig)
    env_no_sig["signature"] = pk2.sign(preimage).hex()
    body = json.dumps(env_no_sig).encode("utf-8")

    with pytest.raises(WireValidationError, match="verification failed"):
        validate_inbound_request(
            body,
            settings=_settings(),
            conn=_conn(),
            clock=lambda: 1_700_000_010.0,
        )


def test_message_expired() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(
        private_key=pk,
        message_id="msg-exp",
        ts=1.0,
        exp=100.0,
    )
    with pytest.raises(WireValidationError, match="expired"):
        validate_inbound_request(
            body,
            settings=_settings(),
            conn=_conn(),
            clock=lambda: 200.0,
        )


def test_future_timestamp_skew() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(
        private_key=pk,
        message_id="msg-skew",
        ts=1_700_000_000.0,
        exp=1_700_000_300.0,
    )
    with pytest.raises(WireValidationError, match="future"):
        validate_inbound_request(
            body,
            settings=_settings(future_timestamp_skew_seconds=10),
            conn=_conn(),
            # now=1699990000, ts=1700000000 -> skew 10000s > 10
            clock=lambda: 1_699_990_000.0,
        )


def test_expiry_window_too_large() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(
        private_key=pk,
        message_id="msg-win",
        ts=1_700_000_000.0,
        exp=1_700_000_000.0 + 5000.0,
    )
    with pytest.raises(WireValidationError, match="expiry window"):
        validate_inbound_request(
            body,
            settings=_settings(max_expiry_window_seconds=60),
            conn=_conn(),
            clock=lambda: 1_700_000_010.0,
        )


def test_target_module_mismatch() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(
        private_key=pk,
        message_id="msg-tm",
        extra={"target_module": "modulr.other"},
    )
    with pytest.raises(WireValidationError, match="target_module"):
        validate_inbound_request(
            body,
            settings=_settings(),
            conn=_conn(),
            clock=lambda: 1_700_000_010.0,
        )


def test_unsupported_operation() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(
        private_key=pk,
        message_id="msg-op",
        operation="register_org",
    )
    with pytest.raises(WireValidationError, match="operation"):
        validate_inbound_request(
            body,
            settings=_settings(),
            conn=_conn(),
            clock=lambda: 1_700_000_010.0,
        )


def test_bootstrap_unauthorized() -> None:
    trusted = Ed25519PrivateKey.generate()
    signer = Ed25519PrivateKey.generate()
    allowed = trusted.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    ).hex()
    body = _signed_body(private_key=signer, message_id="msg-deny")
    with pytest.raises(WireValidationError, match="authorized"):
        validate_inbound_request(
            body,
            settings=_settings(
                bootstrap_public_keys=(allowed,),
                dev_mode=False,
            ),
            conn=_conn(),
            clock=lambda: 1_700_000_010.0,
        )


def test_message_id_conflict() -> None:
    pk = Ed25519PrivateKey.generate()
    body1 = _signed_body(
        private_key=pk,
        message_id="msg-dup",
        payload={"a": 1},
    )
    body2 = _signed_body(
        private_key=pk,
        message_id="msg-dup",
        payload={"a": 2},
    )
    conn = _conn()
    validate_inbound_request(
        body1,
        settings=_settings(),
        conn=conn,
        clock=lambda: 1_700_000_010.0,
    )
    conn.commit()
    with pytest.raises(WireValidationError, match="message_id"):
        validate_inbound_request(
            body2,
            settings=_settings(),
            conn=conn,
            clock=lambda: 1_700_000_010.0,
        )


def test_payload_too_large_canonical() -> None:
    pk = Ed25519PrivateKey.generate()
    big = {"k": "x" * 2_000_000}
    body = _signed_body(private_key=pk, message_id="msg-big", payload=big)
    with pytest.raises(WireValidationError, match="max_payload_bytes"):
        validate_inbound_request(
            body,
            settings=_settings(max_payload_bytes=100),
            conn=_conn(),
            clock=lambda: 1_700_000_010.0,
        )


def test_signature_missing() -> None:
    pk = Ed25519PrivateKey.generate()
    pub = pk.public_key().public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw)
    env = {
        "protocol_version": MODULE_VERSION,
        "message_id": "msg-nosig",
        "target_module": "modulr.core",
        "operation": "lookup_module",
        "sender_id": "user:test",
        "sender_key_type": "ed25519",
        "sender_public_key": pub.hex(),
        "timestamp": 1_700_000_000.0,
        "expires_at": 1_700_000_300.0,
        "payload": {},
        "payload_hash": payload_hash({}),
        "signature_algorithm": "ed25519",
        "signature": "",
    }
    body = json.dumps(env).encode("utf-8")
    with pytest.raises(WireValidationError, match="signature"):
        validate_inbound_request(
            body,
            settings=_settings(),
            conn=_conn(),
            clock=lambda: 1_700_000_010.0,
        )


def test_iso8601_timestamps() -> None:
    pk = Ed25519PrivateKey.generate()
    pub = pk.public_key().public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw)
    payload = {"module_name": "modulr.storage"}
    env = {
        "protocol_version": MODULE_VERSION,
        "message_id": "msg-iso",
        "target_module": "modulr.core",
        "operation": "lookup_module",
        "sender_id": "user:test",
        "sender_key_type": "ed25519",
        "sender_public_key": pub.hex(),
        "timestamp": "2023-11-14T22:13:20+00:00",
        "expires_at": "2023-11-14T23:13:20+00:00",
        "payload": payload,
        "payload_hash": payload_hash(payload),
        "signature_algorithm": "ed25519",
    }
    preimage = envelope_signing_bytes(env)
    env["signature"] = pk.sign(preimage).hex()
    body = json.dumps(env).encode("utf-8")
    conn = _conn()
    validate_inbound_request(
        body,
        settings=_settings(),
        conn=conn,
        clock=lambda: 1_700_000_030.0,
    )

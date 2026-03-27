"""Phase I: operation dispatch and handlers."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from modulr_core import MODULE_VERSION, ErrorCode, SuccessCode, WireValidationError
from modulr_core.config.schema import Settings
from modulr_core.messages.types import ValidatedInbound
from modulr_core.operations.dispatch import dispatch_operation
from modulr_core.persistence import apply_migrations, connect_memory
from modulr_core.repositories.name_bindings import NameBindingsRepository
from modulr_core.validation import envelope_signing_bytes, payload_hash


def _settings(**overrides: Any) -> Settings:
    base = Settings(
        bootstrap_public_keys=(),
        database_path=Path("x.sqlite"),
        max_http_body_bytes=2_097_152,
        max_payload_bytes=1_048_576,
        max_expiry_window_seconds=604_800,
        future_timestamp_skew_seconds=300,
        replay_window_seconds=86_400,
        dev_mode=True,
    )
    return replace(base, **overrides)


def _conn() -> sqlite3.Connection:
    c = connect_memory(check_same_thread=False)
    apply_migrations(c)
    return c


def make_validated_inbound(
    pk: Ed25519PrivateKey,
    operation: str,
    payload: dict[str, Any],
    message_id: str,
) -> ValidatedInbound:
    pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    env: dict[str, Any] = {
        "protocol_version": MODULE_VERSION,
        "message_id": message_id,
        "target_module": "modulr.core",
        "operation": operation,
        "sender_id": "user:test",
        "sender_key_type": "ed25519",
        "sender_public_key": pub.hex(),
        "timestamp": 1_700_000_000.0,
        "expires_at": 1_700_000_300.0,
        "payload": payload,
        "payload_hash": payload_hash(payload),
        "signature_algorithm": "ed25519",
    }
    preimage = envelope_signing_bytes(env)
    env["signature"] = pk.sign(preimage).hex()
    signing_preimage = envelope_signing_bytes(env)
    fp = hashlib.sha256(signing_preimage).digest()
    return ValidatedInbound(
        envelope=env,
        sender_public_key=pub,
        signing_preimage=signing_preimage,
        request_fingerprint=fp,
        is_replay=False,
    )


def test_register_and_lookup_module() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    mod_key = Ed25519PrivateKey.generate().public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_module",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "route": {"base_url": "https://s.example"},
            "signing_public_key": mod_key.hex(),
        },
        "m1",
    )
    out1 = dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out1["status"] == "success"
    assert out1["code"] == str(SuccessCode.MODULE_REGISTERED)
    lu = make_validated_inbound(
        pk,
        "lookup_module",
        {"module_name": "modulr.storage"},
        "m2",
    )
    out2 = dispatch_operation(lu, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out2["code"] == str(SuccessCode.MODULE_FOUND)
    assert out2["payload"]["module_name"] == "modulr.storage"


def test_register_requires_bootstrap_when_configured() -> None:
    pk = Ed25519PrivateKey.generate()
    other = Ed25519PrivateKey.generate()
    allowed = other.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    ).hex()
    conn = _conn()
    mod_key = Ed25519PrivateKey.generate().public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_module",
        {
            "module_name": "modulr.x",
            "module_version": MODULE_VERSION,
            "route": {},
            "signing_public_key": mod_key.hex(),
        },
        "m1",
    )
    with pytest.raises(WireValidationError, match="bootstrap"):
        dispatch_operation(
            reg,
            settings=_settings(
                bootstrap_public_keys=(allowed,),
                dev_mode=False,
            ),
            conn=conn,
            clock=lambda: 1.0,
        )


def test_resolve_name_found() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    NameBindingsRepository(conn).insert(
        name="chris@modulr.network",
        resolved_id="user:abc",
        route_json=json.dumps({"x": 1}),
        metadata_json=None,
        created_at=1,
    )
    conn.commit()
    v = make_validated_inbound(
        pk,
        "resolve_name",
        {"name": "chris@modulr.network"},
        "m1",
    )
    out = dispatch_operation(v, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.NAME_RESOLVED)
    assert out["payload"]["resolved_id"] == "user:abc"


def test_heartbeat_requires_module() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    hb = make_validated_inbound(
        pk,
        "heartbeat_update",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "status": "healthy",
        },
        "m1",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(hb, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.MODULE_NOT_FOUND


def test_heartbeat_after_register() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    mod_key = Ed25519PrivateKey.generate().public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_module",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "route": {},
            "signing_public_key": mod_key.hex(),
        },
        "m1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    hb = make_validated_inbound(
        pk,
        "heartbeat_update",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "status": "healthy",
            "last_seen_at": 99,
        },
        "m2",
    )
    out = dispatch_operation(hb, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.HEARTBEAT_RECORDED)

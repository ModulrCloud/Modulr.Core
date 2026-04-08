"""HTTP genesis challenge routes (unsigned JSON, envelope errors)."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import replace
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient

from modulr_core import MODULE_VERSION, ErrorCode, SuccessCode
from modulr_core.config.schema import NetworkEnvironment, Settings
from modulr_core.http import create_app
from modulr_core.persistence import apply_migrations, connect_memory
from modulr_core.repositories.core_genesis import CoreGenesisRepository


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
        network_environment=NetworkEnvironment.LOCAL,
        network_name="",
    )
    return replace(base, **overrides)


def _conn() -> sqlite3.Connection:
    c = connect_memory(check_same_thread=False)
    apply_migrations(c)
    return c


def _test_pubkey_hex() -> str:
    seed = hashlib.sha256(b"genesis-http-test").digest()
    priv = Ed25519PrivateKey.from_private_bytes(seed)
    return priv.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    ).hex()


def _priv_for_test_pubkey() -> Ed25519PrivateKey:
    seed = hashlib.sha256(b"genesis-http-test").digest()
    return Ed25519PrivateKey.from_private_bytes(seed)


def test_genesis_challenge_issue_and_verify_happy_path() -> None:
    pk_hex = _test_pubkey_hex()
    priv = _priv_for_test_pubkey()
    app = create_app(
        settings=_settings(),
        conn=_conn(),
        clock=lambda: 1_700_000_000,
    )
    client = TestClient(app)
    r1 = client.post(
        "/genesis/challenge",
        content=json.dumps({"subject_signing_pubkey_hex": pk_hex}).encode("utf-8"),
    )
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["status"] == "success"
    assert d1["code"] == str(SuccessCode.GENESIS_CHALLENGE_ISSUED)
    assert d1["payload"]["challenge_body"]
    cid = d1["payload"]["challenge_id"]
    body = d1["payload"]["challenge_body"]
    sig = priv.sign(body.encode("utf-8")).hex()
    r2 = client.post(
        "/genesis/challenge/verify",
        content=json.dumps(
            {"challenge_id": cid, "signature_hex": sig},
        ).encode("utf-8"),
    )
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["status"] == "success"
    assert d2["code"] == str(SuccessCode.GENESIS_CHALLENGE_VERIFIED)
    assert d2["payload"]["verified"] is True


def test_genesis_routes_forbidden_on_production() -> None:
    app = create_app(
        settings=_settings(network_environment=NetworkEnvironment.PRODUCTION),
        conn=_conn(),
        clock=lambda: 1.0,
    )
    client = TestClient(app)
    r = client.post(
        "/genesis/challenge",
        content=json.dumps({"subject_signing_pubkey_hex": "a" * 64}).encode(
            "utf-8",
        ),
    )
    assert r.status_code == 403
    assert r.json()["code"] == ErrorCode.GENESIS_OPERATIONS_NOT_ALLOWED
    rv = client.post(
        "/genesis/challenge/verify",
        content=json.dumps(
            {"challenge_id": "c" * 64, "signature_hex": "s" * 128},
        ).encode("utf-8"),
    )
    assert rv.status_code == 403
    assert rv.json()["code"] == ErrorCode.GENESIS_OPERATIONS_NOT_ALLOWED


def test_genesis_challenge_malformed_json() -> None:
    app = create_app(settings=_settings(), conn=_conn(), clock=lambda: 1.0)
    client = TestClient(app)
    r = client.post("/genesis/challenge", content=b"{")
    assert r.status_code == 400
    assert r.json()["code"] == ErrorCode.MALFORMED_JSON


def test_genesis_challenge_invalid_request_missing_field() -> None:
    app = create_app(settings=_settings(), conn=_conn(), clock=lambda: 1.0)
    client = TestClient(app)
    r = client.post(
        "/genesis/challenge",
        content=json.dumps({}).encode("utf-8"),
    )
    assert r.status_code == 400
    assert r.json()["code"] == ErrorCode.INVALID_REQUEST


def test_genesis_challenge_invalid_pubkey() -> None:
    app = create_app(settings=_settings(), conn=_conn(), clock=lambda: 1.0)
    client = TestClient(app)
    r = client.post(
        "/genesis/challenge",
        content=json.dumps({"subject_signing_pubkey_hex": "not-hex"}).encode(
            "utf-8",
        ),
    )
    assert r.status_code == 400
    assert r.json()["code"] == ErrorCode.PUBLIC_KEY_INVALID


def test_genesis_verify_unknown_challenge_404() -> None:
    app = create_app(settings=_settings(), conn=_conn(), clock=lambda: 1.0)
    client = TestClient(app)
    r = client.post(
        "/genesis/challenge/verify",
        content=json.dumps(
            {
                "challenge_id": "f" * 64,
                "signature_hex": "a" * 128,
            },
        ).encode("utf-8"),
    )
    assert r.status_code == 404
    assert r.json()["code"] == ErrorCode.GENESIS_CHALLENGE_NOT_FOUND


def test_genesis_verify_twice_second_is_409() -> None:
    pk_hex = _test_pubkey_hex()
    priv = _priv_for_test_pubkey()
    app = create_app(settings=_settings(), conn=_conn(), clock=lambda: 1_700_000_000)
    client = TestClient(app)
    d1 = client.post(
        "/genesis/challenge",
        content=json.dumps({"subject_signing_pubkey_hex": pk_hex}).encode("utf-8"),
    ).json()
    body = d1["payload"]["challenge_body"]
    cid = d1["payload"]["challenge_id"]
    sig = priv.sign(body.encode("utf-8")).hex()
    payload = {"challenge_id": cid, "signature_hex": sig}
    b = json.dumps(payload).encode("utf-8")
    assert client.post("/genesis/challenge/verify", content=b).status_code == 200
    r2 = client.post("/genesis/challenge/verify", content=b)
    assert r2.status_code == 409
    assert r2.json()["code"] == ErrorCode.GENESIS_CHALLENGE_CONSUMED


def test_genesis_issue_when_already_complete_409() -> None:
    conn = _conn()
    CoreGenesisRepository(conn).set_genesis_complete(complete=True, updated_at=1)
    conn.commit()
    app = create_app(
        settings=_settings(),
        conn=conn,
        clock=lambda: 10.0,
    )
    client = TestClient(app)
    r = client.post(
        "/genesis/challenge",
        content=json.dumps({"subject_signing_pubkey_hex": _test_pubkey_hex()}).encode(
            "utf-8",
        ),
    )
    assert r.status_code == 409
    assert r.json()["code"] == ErrorCode.GENESIS_ALREADY_COMPLETE


def test_genesis_challenge_body_too_large() -> None:
    app = create_app(
        settings=_settings(max_http_body_bytes=20),
        conn=_conn(),
        clock=lambda: 1.0,
    )
    client = TestClient(app)
    r = client.post(
        "/genesis/challenge",
        content=json.dumps({"subject_signing_pubkey_hex": "x" * 64}).encode(
            "utf-8",
        ),
    )
    assert r.status_code == 413
    assert r.json()["code"] == ErrorCode.MESSAGE_TOO_LARGE


def test_genesis_success_envelope_has_protocol_fields() -> None:
    pk_hex = _test_pubkey_hex()
    app = create_app(settings=_settings(), conn=_conn(), clock=lambda: 1_700_000_000)
    client = TestClient(app)
    d = client.post(
        "/genesis/challenge",
        content=json.dumps({"subject_signing_pubkey_hex": pk_hex}).encode("utf-8"),
    ).json()
    assert d["protocol_version"] == MODULE_VERSION
    assert d["target_module"] == "modulr.core"
    assert d["message_id"] is None
    assert d["correlation_id"] is None
    assert "payload_hash" in d

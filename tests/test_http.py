"""Phase H: FastAPI POST /message and config resolution."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient

from modulr_core import MODULE_VERSION, ErrorCode, SuccessCode
from modulr_core.config.schema import Settings
from modulr_core.errors.exceptions import ConfigurationError
from modulr_core.http import create_app, resolve_config_path
from modulr_core.messages.constants import CORE_OPERATIONS, PROTOCOL_METHOD_OPERATIONS
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
    c = connect_memory(check_same_thread=False)
    apply_migrations(c)
    return c


def _signed_body(
    *,
    private_key: Ed25519PrivateKey,
    message_id: str,
    operation: str = "lookup_module",
    payload: dict[str, Any] | None = None,
) -> bytes:
    payload = (
        {"module_name": "modulr.storage"} if payload is None else payload
    )
    pub = private_key.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    env = {
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
    env["signature"] = private_key.sign(preimage).hex()
    return json.dumps(env).encode("utf-8")


def test_resolve_config_cli_over_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env_file = tmp_path / "env.toml"
    cli_file = tmp_path / "cli.toml"
    env_file.write_text("[modulr_core]\nbootstrap_public_keys = []\ndev_mode = true\n")
    cli_file.write_text("[modulr_core]\nbootstrap_public_keys = []\ndev_mode = true\n")
    monkeypatch.setenv("MODULR_CORE_CONFIG", str(env_file))
    assert resolve_config_path(cli_file) == cli_file
    assert resolve_config_path(None) == env_file


def test_resolve_config_env_only(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    p = tmp_path / "c.toml"
    p.write_text("[modulr_core]\nbootstrap_public_keys = []\ndev_mode = true\n")
    monkeypatch.setenv("MODULR_CORE_CONFIG", str(p))
    assert resolve_config_path(None) == p


def test_resolve_config_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MODULR_CORE_CONFIG", raising=False)
    with pytest.raises(ConfigurationError, match="MODULR_CORE_CONFIG"):
        resolve_config_path(None)


def test_post_message_lookup_unknown_module_404() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(private_key=pk, message_id="http-1", operation="lookup_module")
    app = create_app(
        settings=_settings(),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r = client.post("/message", content=body)
    assert r.status_code == 404
    data = r.json()
    assert data["code"] == ErrorCode.MODULE_NOT_FOUND
    assert data["status"] == "error"


def test_post_message_malformed_json_400() -> None:
    app = create_app(
        settings=_settings(),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r = client.post("/message", content=b"{")
    assert r.status_code == 400
    assert r.json()["code"] == ErrorCode.MALFORMED_JSON


def test_post_message_replay_returns_identical_success_json() -> None:
    pk = Ed25519PrivateKey.generate()
    pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg_payload = {
        "module_name": "modulr.storage",
        "module_version": MODULE_VERSION,
        "route": {"base_url": "https://replay.example"},
        "signing_public_key": pub.hex(),
    }
    body = _signed_body(
        private_key=pk,
        message_id="replay-same",
        operation="register_module",
        payload=reg_payload,
    )
    app = create_app(
        settings=_settings(),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r1 = client.post("/message", content=body)
    r2 = client.post("/message", content=body)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json() == r2.json()


def test_post_message_replay_without_cache_returns_409() -> None:
    pk = Ed25519PrivateKey.generate()
    pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg_payload = {
        "module_name": "modulr.cachemiss",
        "module_version": MODULE_VERSION,
        "route": {},
        "signing_public_key": pub.hex(),
    }
    body = _signed_body(
        private_key=pk,
        message_id="cache-miss",
        operation="register_module",
        payload=reg_payload,
    )
    conn = _conn()
    app = create_app(
        settings=_settings(),
        conn=conn,
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r1 = client.post("/message", content=body)
    assert r1.status_code == 200
    conn.execute(
        "UPDATE message_dedup SET result_summary = ? WHERE message_id = ?",
        ("validated", "cache-miss"),
    )
    conn.commit()
    r2 = client.post("/message", content=body)
    assert r2.status_code == 409
    assert r2.json()["code"] == ErrorCode.REPLAY_RESPONSE_UNAVAILABLE


def test_post_message_too_large_413() -> None:
    app = create_app(
        settings=_settings(max_http_body_bytes=10),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r = client.post("/message", content=b"x" * 20)
    assert r.status_code == 413
    assert r.json()["code"] == ErrorCode.MESSAGE_TOO_LARGE


def test_create_app_from_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    pk = Ed25519PrivateKey.generate()
    pub_hex = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    ).hex()
    db_path = tmp_path / "d" / "db.sqlite"
    cfg = tmp_path / "cfg.toml"
    cfg.write_text(
        f"""[modulr_core]
bootstrap_public_keys = ["{pub_hex}"]
database_path = "{db_path.as_posix()}"
dev_mode = false
""",
        encoding="utf-8",
    )
    monkeypatch.delenv("MODULR_CORE_CONFIG", raising=False)
    app = create_app(
        config_path=cfg,
        clock=lambda: 1_700_000_010.0,
    )
    mod_k = Ed25519PrivateKey.generate().public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg_payload = {
        "module_name": "modulr.storage",
        "module_version": MODULE_VERSION,
        "route": {"base_url": "https://example.invalid"},
        "signing_public_key": mod_k.hex(),
    }
    body_reg = _signed_body(
        private_key=pk,
        message_id="file-reg",
        operation="register_module",
        payload=reg_payload,
    )
    body_lu = _signed_body(
        private_key=pk,
        message_id="file-lu",
        operation="lookup_module",
    )
    with TestClient(app) as client:
        r1 = client.post("/message", content=body_reg)
        assert r1.status_code == 200
        assert r1.json()["code"] == str(SuccessCode.MODULE_REGISTERED)
        r2 = client.post("/message", content=body_lu)
        assert r2.status_code == 200
        assert r2.json()["code"] == str(SuccessCode.MODULE_FOUND)


def test_playground_protocol_info_when_dev_mode() -> None:
    app = create_app(
        settings=_settings(dev_mode=True),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r = client.get("/playground/protocol-info")
    assert r.status_code == 200
    data = r.json()
    assert "protocol_version" in data
    assert data.get("target_module") == "modulr.core"


def test_playground_not_mounted_when_not_dev_mode() -> None:
    app = create_app(
        settings=_settings(dev_mode=False),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    assert client.get("/playground/protocol-info").status_code == 404


def test_get_version() -> None:
    app = create_app(
        settings=_settings(),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r = client.get("/version")
    assert r.status_code == 200
    data = r.json()
    assert data["target_module"] == "modulr.core"
    assert data["version"] == MODULE_VERSION


def test_post_message_get_protocol_version() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(
        private_key=pk,
        message_id="gpv-1",
        operation="get_protocol_version",
        payload={},
    )
    app = create_app(
        settings=_settings(),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r = client.post("/message", content=body)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "success"
    assert data["code"] == str(SuccessCode.PROTOCOL_VERSION_RETURNED)
    assert data["payload"]["protocol_version"] == MODULE_VERSION


def test_post_message_get_module_methods_modulr_core() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(
        private_key=pk,
        message_id="gmm-http-1",
        operation="get_module_methods",
        payload={"module_id": "modulr.core"},
    )
    app = create_app(
        settings=_settings(),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r = client.post("/message", content=body)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "success"
    assert data["code"] == str(SuccessCode.MODULE_METHODS_RETURNED)
    assert data["payload"]["module_id"] == "modulr.core"
    assert data["payload"]["methods"] == sorted(CORE_OPERATIONS)


def test_post_message_get_protocol_methods() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(
        private_key=pk,
        message_id="gpm-http-1",
        operation="get_protocol_methods",
        payload={},
    )
    app = create_app(
        settings=_settings(),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r = client.post("/message", content=body)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "success"
    assert data["code"] == str(SuccessCode.PROTOCOL_METHODS_RETURNED)
    assert data["payload"]["methods"] == sorted(PROTOCOL_METHOD_OPERATIONS)


def test_post_message_get_module_route_modulr_core() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(
        private_key=pk,
        message_id="gmr-http-1",
        operation="get_module_route",
        payload={"module_id": "modulr.core"},
    )
    app = create_app(
        settings=_settings(),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r = client.post("/message", content=body)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "success"
    assert data["code"] == str(SuccessCode.MODULE_ROUTE_RETURNED)
    assert data["payload"]["module_id"] == "modulr.core"
    assert data["payload"]["route_detail"]["kind"] == "modulr.core"
    assert data["payload"]["routes"] == []


def test_post_message_submit_module_route() -> None:
    pk = Ed25519PrivateKey.generate()
    pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    app = create_app(
        settings=_settings(),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    register_body = _signed_body(
        private_key=pk,
        message_id="smr-http-reg",
        operation="register_module",
        payload={
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "route": {"base_url": "https://old.example"},
            "signing_public_key": pub.hex(),
        },
    )
    register_resp = client.post("/message", content=register_body)
    assert register_resp.status_code == 200

    submit_body = _signed_body(
        private_key=pk,
        message_id="smr-http-1",
        operation="submit_module_route",
        payload={
            "module_id": "modulr.storage",
            "route_type": "ip",
            "route": "203.0.113.10:8443",
        },
    )
    r = client.post("/message", content=submit_body)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "success"
    assert data["code"] == str(SuccessCode.MODULE_ROUTE_SUBMITTED)
    assert data["payload"]["module_id"] == "modulr.storage"
    assert data["payload"]["route_type"] == "ip"
    assert data["payload"]["route"] == "203.0.113.10:8443"
    assert data["payload"]["mode"] == "replace_all"
    assert data["payload"]["priority"] == 0


def test_post_message_get_protocol_version_rejects_non_empty_payload() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(
        private_key=pk,
        message_id="gpv-2",
        operation="get_protocol_version",
        payload={"extra": "nope"},
    )
    app = create_app(
        settings=_settings(),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r = client.post("/message", content=body)
    assert r.status_code == 400
    assert r.json()["code"] == ErrorCode.PAYLOAD_INVALID

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

from modulr_core import MODULE_VERSION, ErrorCode
from modulr_core.config.schema import Settings
from modulr_core.errors.exceptions import ConfigurationError
from modulr_core.http import create_app, resolve_config_path
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
) -> bytes:
    payload = {"module_name": "modulr.storage"}
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


def test_post_message_placeholder_501() -> None:
    pk = Ed25519PrivateKey.generate()
    body = _signed_body(private_key=pk, message_id="http-1", operation="lookup_module")
    app = create_app(
        settings=_settings(),
        conn=_conn(),
        clock=lambda: 1_700_000_010.0,
    )
    client = TestClient(app)
    r = client.post("/message", content=body)
    assert r.status_code == 501
    data = r.json()
    assert data["code"] == ErrorCode.OPERATION_NOT_IMPLEMENTED
    assert data["status"] == "error"
    assert "lookup_module" in data["detail"]


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
    body = _signed_body(private_key=pk, message_id="file-1")
    with TestClient(app) as client:
        r = client.post("/message", content=body)
    assert r.status_code == 501

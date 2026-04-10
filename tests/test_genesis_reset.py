"""Guarded genesis reset (stage 8)."""

from __future__ import annotations

import json
import sqlite3

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from modulr_core.config import load_settings_from_str
from modulr_core.genesis.reset import (
    GenesisResetError,
    genesis_reset_allowed,
    reset_genesis_state,
)
from modulr_core.persistence import apply_migrations, connect_memory
from modulr_core.repositories.core_genesis import CoreGenesisRepository
from modulr_core.repositories.genesis_challenge import GenesisChallengeRepository
from modulr_core.repositories.name_bindings import NameBindingsRepository


def _conn() -> sqlite3.Connection:
    c = connect_memory(check_same_thread=False)
    apply_migrations(c)
    return c


def _valid_k() -> str:
    pk = Ed25519PrivateKey.generate().public_key()
    return pk.public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw).hex()


def test_genesis_reset_allowed_dev_mode() -> None:
    k = _valid_k()
    s = load_settings_from_str(
        f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
network_environment = "local"
dev_mode = true
""",
    )
    assert genesis_reset_allowed(s) is True


def test_genesis_reset_allowed_testnet_strict_requires_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    k = _valid_k()
    s = load_settings_from_str(
        f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
network_environment = "testnet"
dev_mode = false
""",
    )
    monkeypatch.delenv("MODULR_ALLOW_GENESIS_RESET", raising=False)
    assert genesis_reset_allowed(s) is False
    monkeypatch.setenv("MODULR_ALLOW_GENESIS_RESET", "1")
    assert genesis_reset_allowed(s) is True


def test_genesis_reset_allowed_production_false() -> None:
    k = _valid_k()
    s = load_settings_from_str(
        f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
network_environment = "production"
dev_mode = false
""",
    )
    assert genesis_reset_allowed(s) is False


def test_reset_clears_challenges_and_wizard_state() -> None:
    conn = _conn()
    grepo = CoreGenesisRepository(conn)
    chrepo = GenesisChallengeRepository(conn)
    chrepo.insert(
        challenge_id="a" * 64,
        subject_signing_pubkey_hex=_valid_k(),
        body="x",
        issued_at=1,
        expires_at=9,
    )
    conn.commit()
    reset_genesis_state(
        conn=conn,
        clock=lambda: 100.0,
        genesis_repo=grepo,
        challenge_repo=chrepo,
        name_repo=NameBindingsRepository(conn),
    )
    conn.commit()
    assert chrepo.get_by_id("a" * 64) is None
    s = grepo.get()
    assert s.genesis_complete is False
    assert s.bootstrap_signing_pubkey_hex is None


def test_reset_after_complete_removes_name_binding() -> None:
    conn = _conn()
    grepo = CoreGenesisRepository(conn)
    nrepo = NameBindingsRepository(conn)
    op_k = _valid_k()
    grepo.set_genesis_root_organization_label(label="modulr", updated_at=1)
    grepo.set_bootstrap_signing_pubkey_hex(pubkey_hex=op_k, updated_at=1)
    grepo.set_genesis_complete(complete=True, updated_at=1)
    nrepo.insert(
        name="modulr",
        resolved_id=_valid_k(),
        route_json=None,
        metadata_json=None,
        created_at=1,
    )
    conn.commit()
    reset_genesis_state(
        conn=conn,
        clock=lambda: 2.0,
        genesis_repo=grepo,
        challenge_repo=GenesisChallengeRepository(conn),
        name_repo=nrepo,
    )
    conn.commit()
    assert nrepo.get_by_name("modulr") is None
    assert CoreGenesisRepository(conn).get().genesis_complete is False


def test_reset_complete_without_stored_label_requires_override() -> None:
    conn = _conn()
    grepo = CoreGenesisRepository(conn)
    conn.execute(
        """
        UPDATE core_genesis SET genesis_complete = 1, updated_at = 1
        WHERE singleton = 1
        """,
    )
    conn.commit()
    with pytest.raises(GenesisResetError, match="genesis_root_organization_label"):
        reset_genesis_state(
            conn=conn,
            clock=lambda: 1.0,
            genesis_repo=grepo,
            challenge_repo=GenesisChallengeRepository(conn),
            name_repo=NameBindingsRepository(conn),
        )


def test_reset_complete_without_stored_label_with_override() -> None:
    conn = _conn()
    grepo = CoreGenesisRepository(conn)
    nrepo = NameBindingsRepository(conn)
    nrepo.insert(
        name="modulr",
        resolved_id=_valid_k(),
        route_json=None,
        metadata_json=None,
        created_at=1,
    )
    conn.execute(
        """
        UPDATE core_genesis SET genesis_complete = 1, updated_at = 1
        WHERE singleton = 1
        """,
    )
    conn.commit()
    reset_genesis_state(
        conn=conn,
        clock=lambda: 2.0,
        genesis_repo=grepo,
        challenge_repo=GenesisChallengeRepository(conn),
        name_repo=nrepo,
        root_organization_name_override="Modulr",
    )
    conn.commit()
    assert nrepo.get_by_name("modulr") is None
    assert not CoreGenesisRepository(conn).get().genesis_complete


def test_genesis_cli_reset_smoke(
    capsys: pytest.CaptureFixture[str],
    tmp_path,
) -> None:
    k = _valid_k()
    db = tmp_path / "g.sqlite"
    p = tmp_path / "op.toml"
    p.write_text(
        f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
database_path = "{db.as_posix()}"
dev_mode = true
network_environment = "local"
""",
        encoding="utf-8",
    )
    from modulr_core.genesis.cli import genesis_main

    with pytest.raises(SystemExit) as ei:
        genesis_main(["-c", str(p), "reset", "--yes"])
    assert ei.value.code == 0
    captured = capsys.readouterr()
    assert "WARNING" in captured.err
    d = json.loads(captured.out)
    assert d["status"] == "success"
    assert d["code"] == "GENESIS_RESET_COMPLETED"

"""Singleton ``core_genesis`` persistence (migration 007)."""

from __future__ import annotations

import sqlite3

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from modulr_core.persistence import apply_migrations, connect_memory
from modulr_core.repositories.core_genesis import CoreGenesisRepository


def _valid_pubkey_hex() -> str:
    pk = Ed25519PrivateKey.generate().public_key()
    return pk.public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw).hex()


def _conn() -> sqlite3.Connection:
    c = connect_memory(check_same_thread=False)
    apply_migrations(c)
    return c


def test_core_genesis_default_after_migration() -> None:
    conn = _conn()
    repo = CoreGenesisRepository(conn)
    s = repo.get()
    assert s.genesis_complete is False
    assert s.bootstrap_signing_pubkey_hex is None
    assert s.modulr_apex_domain is None
    assert s.updated_at == 0


def test_core_genesis_set_pubkey_and_complete() -> None:
    conn = _conn()
    repo = CoreGenesisRepository(conn)
    k = _valid_pubkey_hex()
    repo.set_bootstrap_signing_pubkey_hex(pubkey_hex=k, updated_at=100)
    repo.set_modulr_apex_domain(apex_domain="modulr.network", updated_at=101)
    repo.set_genesis_complete(complete=True, updated_at=102)
    conn.commit()

    s = repo.get()
    assert s.genesis_complete is True
    assert s.bootstrap_signing_pubkey_hex == k
    assert s.modulr_apex_domain == "modulr.network"
    assert s.updated_at == 102


def test_core_genesis_rejects_invalid_pubkey_hex() -> None:
    conn = _conn()
    repo = CoreGenesisRepository(conn)
    with pytest.raises(ValueError, match="expected 64 hex"):
        repo.set_bootstrap_signing_pubkey_hex(pubkey_hex="not-hex", updated_at=1)


def test_core_genesis_rejects_uppercase_pubkey_hex() -> None:
    conn = _conn()
    repo = CoreGenesisRepository(conn)
    bad = _valid_pubkey_hex().upper()
    with pytest.raises(ValueError, match="lowercase"):
        repo.set_bootstrap_signing_pubkey_hex(pubkey_hex=bad, updated_at=1)


def test_core_genesis_clear_pubkey() -> None:
    conn = _conn()
    repo = CoreGenesisRepository(conn)
    k = _valid_pubkey_hex()
    repo.set_bootstrap_signing_pubkey_hex(pubkey_hex=k, updated_at=50)
    repo.set_bootstrap_signing_pubkey_hex(pubkey_hex=None, updated_at=51)
    conn.commit()
    assert repo.get().bootstrap_signing_pubkey_hex is None


def test_core_genesis_apex_domain_validation() -> None:
    conn = _conn()
    repo = CoreGenesisRepository(conn)
    with pytest.raises(ValueError, match="non-empty"):
        repo.set_modulr_apex_domain(apex_domain="   ", updated_at=1)
    with pytest.raises(ValueError, match="at most"):
        repo.set_modulr_apex_domain(apex_domain="x" * 254, updated_at=1)


def test_schema_migrations_includes_007() -> None:
    conn = _conn()
    cur = conn.execute(
        "SELECT 1 FROM schema_migrations WHERE version = 7",
    )
    assert cur.fetchone() is not None

"""Genesis challenge v1 body, Ed25519 verify, and one-shot SQLite service."""

from __future__ import annotations

import hashlib
import sqlite3

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from modulr_core.genesis.challenge import (
    CHALLENGE_PURPOSE,
    CHALLENGE_TTL_SECONDS,
    GENESIS_CHALLENGE_FORMAT_VERSION,
    GenesisChallengeError,
    GenesisChallengeService,
    build_genesis_challenge_v1_body,
    verify_genesis_challenge_signature,
)
from modulr_core.persistence import apply_migrations, connect_memory
from modulr_core.repositories.core_genesis import CoreGenesisRepository
from modulr_core.repositories.genesis_challenge import GenesisChallengeRepository


def _test_keypair() -> tuple[Ed25519PrivateKey, str]:
    seed = hashlib.sha256(b"genesis-challenge-test-vector").digest()
    priv = Ed25519PrivateKey.from_private_bytes(seed)
    pub_hex = priv.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    ).hex()
    return priv, pub_hex


def _conn() -> sqlite3.Connection:
    c = connect_memory(check_same_thread=False)
    apply_migrations(c)
    return c


def test_build_genesis_challenge_v1_body_golden() -> None:
    _, pk = _test_keypair()
    body = build_genesis_challenge_v1_body(
        instance_id="11111111-1111-4111-8111-111111111111",
        nonce_hex="a" * 64,
        issued_at_unix=1_700_000_000,
        expires_at_unix=1_700_000_000 + CHALLENGE_TTL_SECONDS,
        subject_signing_pubkey_hex=pk,
    )
    expected = (
        f"{GENESIS_CHALLENGE_FORMAT_VERSION}\n"
        "instance_id: 11111111-1111-4111-8111-111111111111\n"
        f"nonce: {'a' * 64}\n"
        "issued_at_unix: 1700000000\n"
        f"expires_at_unix: {1_700_000_000 + CHALLENGE_TTL_SECONDS}\n"
        f"subject_signing_pubkey_hex: {pk}\n"
        f"purpose: {CHALLENGE_PURPOSE}"
    )
    assert body == expected
    assert not body.endswith("\n")
    priv, _ = _test_keypair()
    sig = priv.sign(body.encode("utf-8")).hex()
    verify_genesis_challenge_signature(
        body=body,
        signature_hex=sig,
        expected_subject_pubkey_hex=pk,
    )


def test_verify_rejects_wrong_signature() -> None:
    _, pk = _test_keypair()
    other_priv = Ed25519PrivateKey.generate()
    body = build_genesis_challenge_v1_body(
        instance_id="22222222-2222-4222-8222-222222222222",
        nonce_hex="b" * 64,
        issued_at_unix=100,
        expires_at_unix=100 + CHALLENGE_TTL_SECONDS,
        subject_signing_pubkey_hex=pk,
    )
    bad_sig = other_priv.sign(body.encode("utf-8")).hex()
    with pytest.raises(GenesisChallengeError, match="signature verification failed"):
        verify_genesis_challenge_signature(
            body=body,
            signature_hex=bad_sig,
            expected_subject_pubkey_hex=pk,
        )


def test_genesis_challenge_service_happy_path() -> None:
    conn = _conn()
    g_repo = CoreGenesisRepository(conn)
    c_repo = GenesisChallengeRepository(conn)
    priv, pk = _test_keypair()
    t = {"now": 1_000}

    svc = GenesisChallengeService(
        genesis_repo=g_repo,
        challenge_repo=c_repo,
        clock=lambda: t["now"],
    )
    issued = svc.issue(subject_signing_pubkey_hex=pk)
    conn.commit()
    assert len(issued.challenge_id) == 64
    assert issued.expires_at_unix == t["now"] + CHALLENGE_TTL_SECONDS
    sig = priv.sign(issued.body.encode("utf-8")).hex()
    svc.verify_and_consume(challenge_id=issued.challenge_id, signature_hex=sig)
    conn.commit()

    with pytest.raises(GenesisChallengeError, match="already consumed"):
        svc.verify_and_consume(challenge_id=issued.challenge_id, signature_hex=sig)


def test_genesis_challenge_service_expired() -> None:
    conn = _conn()
    g_repo = CoreGenesisRepository(conn)
    c_repo = GenesisChallengeRepository(conn)
    priv, pk = _test_keypair()
    t = {"now": 500}

    svc = GenesisChallengeService(
        genesis_repo=g_repo,
        challenge_repo=c_repo,
        clock=lambda: t["now"],
    )
    issued = svc.issue(subject_signing_pubkey_hex=pk)
    conn.commit()
    sig = priv.sign(issued.body.encode("utf-8")).hex()
    t["now"] = issued.expires_at_unix + 1
    with pytest.raises(GenesisChallengeError, match="expired"):
        svc.verify_and_consume(challenge_id=issued.challenge_id, signature_hex=sig)


def test_genesis_challenge_service_blocks_when_genesis_complete() -> None:
    conn = _conn()
    g_repo = CoreGenesisRepository(conn)
    c_repo = GenesisChallengeRepository(conn)
    priv, pk = _test_keypair()
    g_repo.set_genesis_complete(complete=True, updated_at=1)
    conn.commit()

    svc = GenesisChallengeService(
        genesis_repo=g_repo,
        challenge_repo=c_repo,
        clock=lambda: 100,
    )
    with pytest.raises(GenesisChallengeError, match="genesis already complete"):
        svc.issue(subject_signing_pubkey_hex=pk)

    g_repo.set_genesis_complete(complete=False, updated_at=2)
    conn.commit()
    issued = svc.issue(subject_signing_pubkey_hex=pk)
    conn.commit()
    sig = priv.sign(issued.body.encode("utf-8")).hex()
    g_repo.set_genesis_complete(complete=True, updated_at=3)
    conn.commit()
    with pytest.raises(GenesisChallengeError, match="genesis already complete"):
        svc.verify_and_consume(challenge_id=issued.challenge_id, signature_hex=sig)


def test_genesis_challenge_service_unknown_id() -> None:
    conn = _conn()
    g_repo = CoreGenesisRepository(conn)
    c_repo = GenesisChallengeRepository(conn)
    svc = GenesisChallengeService(
        genesis_repo=g_repo,
        challenge_repo=c_repo,
        clock=lambda: 1,
    )
    with pytest.raises(GenesisChallengeError, match="unknown challenge_id"):
        svc.verify_and_consume(challenge_id="f" * 64, signature_hex="a" * 128)


def test_get_or_create_instance_id_stable() -> None:
    conn = _conn()
    repo = CoreGenesisRepository(conn)
    a = repo.get_or_create_instance_id(updated_at=10)
    b = repo.get_or_create_instance_id(updated_at=20)
    assert a == b
    assert repo.get().instance_id == a

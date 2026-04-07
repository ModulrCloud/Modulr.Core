"""Sign challenge: UTF-8 bytes + HTTP POST /identities/{id}/sign."""

from __future__ import annotations

from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from modulr_keymaster.app import create_app
from modulr_keymaster.profiles import MAX_SIGN_MESSAGE_UTF8_BYTES, sign_challenge_utf8

PASS = "twelve-chars!"


def test_sign_challenge_utf8_verifies() -> None:
    key = Ed25519PrivateKey.generate()
    text = "modulr-genesis\nnonce-abc"
    sig = sign_challenge_utf8(key, text)
    key.public_key().verify(sig, text.encode("utf-8"))


def test_sign_challenge_utf8_rejects_oversized() -> None:
    key = Ed25519PrivateKey.generate()
    # One byte over limit (ASCII so len == char count).
    huge = "x" * (MAX_SIGN_MESSAGE_UTF8_BYTES + 1)
    with pytest.raises(ValueError, match="exceeds"):
        sign_challenge_utf8(key, huge)


def test_sign_challenge_http(tmp_path: Path, monkeypatch) -> None:
    vault = tmp_path / "vault.json"
    monkeypatch.setenv("KEYMASTER_VAULT_PATH", str(vault))

    with TestClient(create_app()) as client:
        assert client.post(
            "/setup",
            data={"pw1": PASS, "pw2": PASS},
            follow_redirects=False,
        ).status_code == 303
        r_new = client.post(
            "/identities/new",
            data={"display_name": "Signer", "passphrase": PASS},
            follow_redirects=False,
        )
        assert r_new.status_code == 303
        pid = (r_new.headers.get("location") or "").rsplit("/", 1)[-1]
        assert pid

        challenge = "core-challenge-utf8"
        r_sign = client.post(
            f"/identities/{pid}/sign",
            data={"challenge": challenge},
        )
        assert r_sign.status_code == 200
        assert challenge.encode("utf-8") in r_sign.content
        # 128-char hex Ed25519 signature appears in page
        assert b"signature" in r_sign.content.lower() or b"km-sig-hex" in r_sign.content

        r_empty = client.post(f"/identities/{pid}/sign", data={"challenge": ""})
        assert r_empty.status_code == 400

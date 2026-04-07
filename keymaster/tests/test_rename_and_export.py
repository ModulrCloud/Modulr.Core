"""Rename identity and public key JSON export."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from modulr_keymaster.app import create_app
from modulr_keymaster.profiles import inner_payload_to_profiles, rename_profile_in_list
from modulr_keymaster.vault_crypto import decrypt_vault_payload
from modulr_keymaster.vault_file import read_envelope

PASS = "twelve-chars!"


def test_rename_profile_in_list() -> None:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from modulr_keymaster.profiles import ProfileSecrets, validate_display_name

    k = Ed25519PrivateKey.generate()
    p = ProfileSecrets(
        id="id-1",
        display_name="Old",
        created_at="2026-01-01T00:00:00Z",
        private_key=k,
    )
    profiles = [p]
    assert rename_profile_in_list(profiles, "id-1", "  New Name  ") is True
    assert profiles[0].display_name == validate_display_name("  New Name  ")
    assert rename_profile_in_list(profiles, "missing", "x") is False


def test_validate_display_name_errors() -> None:
    from modulr_keymaster.profiles import DISPLAY_NAME_MAX_LEN, validate_display_name

    with pytest.raises(ValueError, match="required"):
        validate_display_name("   ")
    with pytest.raises(ValueError, match="at most"):
        validate_display_name("x" * (DISPLAY_NAME_MAX_LEN + 1))


def test_rename_http_updates_disk(tmp_path: Path, monkeypatch) -> None:
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
            data={"display_name": "Alpha", "passphrase": PASS},
            follow_redirects=False,
        )
        assert r_new.status_code == 303
        pid = (r_new.headers.get("location") or "").rsplit("/", 1)[-1]

        r_bad = client.post(
            f"/identities/{pid}/rename",
            data={"display_name": "   ", "passphrase": PASS},
        )
        assert r_bad.status_code == 400

        r_wrong = client.post(
            f"/identities/{pid}/rename",
            data={"display_name": "Beta", "passphrase": "nope-not-the-pass"},
        )
        assert r_wrong.status_code == 401

        r_ok = client.post(
            f"/identities/{pid}/rename",
            data={"display_name": "Beta", "passphrase": PASS},
            follow_redirects=False,
        )
        assert r_ok.status_code == 303
        assert r_ok.headers.get("location") == f"/identities/{pid}"

        dash = client.get(f"/identities/{pid}")
        assert dash.status_code == 200
        assert b"Beta" in dash.content
        assert b"Alpha" not in dash.content

    env = read_envelope(vault)
    inner = decrypt_vault_payload(PASS, env)
    profs = inner_payload_to_profiles(inner)
    assert len(profs) == 1
    assert profs[0].display_name == "Beta"


def test_export_pub_json(tmp_path: Path, monkeypatch) -> None:
    vault = tmp_path / "vault.json"
    monkeypatch.setenv("KEYMASTER_VAULT_PATH", str(vault))

    with TestClient(create_app()) as client:
        client.post(
            "/setup",
            data={"pw1": PASS, "pw2": PASS},
            follow_redirects=False,
        )
        r_new = client.post(
            "/identities/new",
            data={"display_name": "Gamma Ray", "passphrase": PASS},
            follow_redirects=False,
        )
        assert r_new.status_code == 303
        pid = (r_new.headers.get("location") or "").rsplit("/", 1)[-1]

        r = client.get(f"/identities/{pid}/export-pub")
        assert r.status_code == 200
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        assert "pub.json" in r.headers.get("content-disposition", "")
        data = json.loads(r.text)
        assert data["format"] == "modulr_keymaster_ed25519_public_v1"
        assert data["display_name"] == "Gamma Ray"
        assert data["profile_id"] == pid
        assert len(data["public_key_hex"]) == 64

"""Add identity: POST /identities/new persists to vault."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from modulr_keymaster.app import create_app
from modulr_keymaster.profiles import inner_payload_to_profiles
from modulr_keymaster.vault_crypto import decrypt_vault_payload
from modulr_keymaster.vault_file import read_envelope

PASS = "twelve-chars!"


def test_add_identity_http_and_disk(tmp_path: Path, monkeypatch) -> None:
    vault = tmp_path / "vault.json"
    monkeypatch.setenv("KEYMASTER_VAULT_PATH", str(vault))

    with TestClient(create_app()) as client:
        r0 = client.post(
            "/setup",
            data={"pw1": PASS, "pw2": PASS},
            follow_redirects=False,
        )
        assert r0.status_code == 303
        r1 = client.post(
            "/identities/new",
            data={"display_name": "Personal", "passphrase": PASS},
            follow_redirects=False,
        )
        assert r1.status_code == 303
        loc = r1.headers.get("location") or ""
        assert loc.startswith("/identities/")
        pid = loc.rsplit("/", 1)[-1]
        assert pid

        page = client.get("/identities")
        assert page.status_code == 200
        assert b"Personal" in page.content

        detail = client.get(f"/identities/{pid}")
        assert detail.status_code == 200

    env = read_envelope(vault)
    inner = decrypt_vault_payload(PASS, env)
    profs = inner_payload_to_profiles(inner)
    assert len(profs) == 1
    assert profs[0].display_name == "Personal"
    assert profs[0].id == pid


def test_add_identity_wrong_passphrase(tmp_path: Path, monkeypatch) -> None:
    vault = tmp_path / "vault.json"
    monkeypatch.setenv("KEYMASTER_VAULT_PATH", str(vault))

    with TestClient(create_app()) as client:
        client.post(
            "/setup",
            data={"pw1": PASS, "pw2": PASS},
            follow_redirects=False,
        )
        r = client.post(
            "/identities/new",
            data={"display_name": "X", "passphrase": "wrong-passphrase-here"},
            follow_redirects=False,
        )
        assert r.status_code == 401

    env = read_envelope(vault)
    inner = decrypt_vault_payload(PASS, env)
    assert len(inner_payload_to_profiles(inner)) == 0

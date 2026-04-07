"""HTTP flow: create vault writes file and sets session."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from modulr_keymaster.app import create_app


def test_post_setup_creates_vault_and_cookie(tmp_path: Path, monkeypatch) -> None:
    vault = tmp_path / "vault.json"
    monkeypatch.setenv("KEYMASTER_VAULT_PATH", str(vault))

    with TestClient(create_app()) as client:
        response = client.post(
            "/setup",
            data={"pw1": "twelve-chars!", "pw2": "twelve-chars!"},
            follow_redirects=False,
        )
    assert response.status_code == 303
    assert response.headers.get("location") == "/identities?created=1"
    assert vault.is_file()
    assert "keymaster_session" in response.cookies

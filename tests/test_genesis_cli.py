"""``modulr-core genesis`` CLI (same semantics as HTTP genesis routes)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from modulr_core import SuccessCode
from modulr_core.genesis.cli import genesis_main


def _valid_hex_pubkey() -> str:
    pk = Ed25519PrivateKey.generate().public_key()
    return pk.public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw).hex()


def _genesis_config(tmp_path: Path, *, production: bool) -> str:
    k = _valid_hex_pubkey()
    db = tmp_path / "core.sqlite"
    net = "production" if production else "local"
    p = tmp_path / "op.toml"
    p.write_text(
        f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
database_path = "{db.as_posix()}"
dev_mode = true
network_environment = "{net}"
""",
        encoding="utf-8",
    )
    return str(p)


def _stable_test_pubkey_hex() -> str:
    seed = hashlib.sha256(b"genesis-cli-test").digest()
    priv = Ed25519PrivateKey.from_private_bytes(seed)
    return (
        priv.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )


def _stable_priv() -> Ed25519PrivateKey:
    seed = hashlib.sha256(b"genesis-cli-test").digest()
    return Ed25519PrivateKey.from_private_bytes(seed)


def test_genesis_cli_blocked_on_production(tmp_path: Path) -> None:
    cfg = _genesis_config(tmp_path, production=True)
    pk = _stable_test_pubkey_hex()
    with pytest.raises(SystemExit) as ei:
        genesis_main(
            [
                "-c",
                cfg,
                "challenge",
                "--subject-signing-pubkey",
                pk,
            ],
        )
    assert ei.value.code == 2


def test_genesis_cli_challenge_issue_json(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    cfg = _genesis_config(tmp_path, production=False)
    pk = _stable_test_pubkey_hex()
    with pytest.raises(SystemExit) as ei:
        genesis_main(
            [
                "-c",
                cfg,
                "challenge",
                "--subject-signing-pubkey",
                pk,
            ],
        )
    assert ei.value.code == 0
    out = capsys.readouterr().out
    d = json.loads(out)
    assert d["status"] == "success"
    assert d["code"] == str(SuccessCode.GENESIS_CHALLENGE_ISSUED)
    assert d["payload"]["challenge_id"]
    assert d["payload"]["challenge_body"]


def test_genesis_cli_full_happy_path(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    cfg = _genesis_config(tmp_path, production=False)
    pk_hex = _stable_test_pubkey_hex()
    priv = _stable_priv()

    with pytest.raises(SystemExit) as ei:
        genesis_main(
            ["-c", cfg, "challenge", "--subject-signing-pubkey", pk_hex],
        )
    assert ei.value.code == 0
    d1 = json.loads(capsys.readouterr().out)
    cid = d1["payload"]["challenge_id"]
    body = d1["payload"]["challenge_body"]
    sig = priv.sign(body.encode("utf-8")).hex()

    with pytest.raises(SystemExit) as ei2:
        genesis_main(
            [
                "-c",
                cfg,
                "verify",
                "--challenge-id",
                cid,
                "--signature-hex",
                sig,
            ],
        )
    assert ei2.value.code == 0
    d2 = json.loads(capsys.readouterr().out)
    assert d2["payload"]["verified"] is True

    org_pk = _valid_hex_pubkey()
    with pytest.raises(SystemExit) as ei3:
        genesis_main(
            [
                "-c",
                cfg,
                "complete",
                "--challenge-id",
                cid,
                "--subject-signing-pubkey",
                pk_hex,
                "--root-organization-name",
                "modulr",
                "--root-organization-signing-public-key-hex",
                org_pk,
            ],
        )
    assert ei3.value.code == 0
    d3 = json.loads(capsys.readouterr().out)
    assert d3["code"] == str(SuccessCode.GENESIS_WIZARD_COMPLETED)
    assert d3["payload"]["genesis_complete"] is True


def test_main_dispatches_genesis(monkeypatch: pytest.MonkeyPatch) -> None:
    called: list[list[str]] = []

    def fake_genesis_main(argv: list[str]) -> None:
        called.append(list(argv))
        raise SystemExit(0)

    monkeypatch.setattr("modulr_core.genesis.cli.genesis_main", fake_genesis_main)
    from modulr_core.cli import main

    with pytest.raises(SystemExit):
        main(["genesis", "challenge", "--help"])
    assert called and called[0][0] == "challenge"

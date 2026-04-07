"""Vault envelope encrypt/decrypt."""

from __future__ import annotations

import pytest

from modulr_keymaster.vault_crypto import (
    VaultCryptoError,
    decrypt_vault_payload,
    encrypt_vault_payload,
)


def test_encrypt_decrypt_roundtrip() -> None:
    inner = {"profiles": []}
    env = encrypt_vault_payload("twelve-chars!", inner)
    assert env["vault_version"] == 1
    assert env["kdf"] == "argon2id"
    out = decrypt_vault_payload("twelve-chars!", env)
    assert out == inner


def test_wrong_passphrase() -> None:
    inner = {"profiles": []}
    env = encrypt_vault_payload("twelve-chars!", inner)
    with pytest.raises(VaultCryptoError):
        decrypt_vault_payload("twelve-wrong!", env)

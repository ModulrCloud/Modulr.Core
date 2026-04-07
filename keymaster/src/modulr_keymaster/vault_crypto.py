"""Encrypt/decrypt vault envelope (Argon2id + AES-GCM)."""

from __future__ import annotations

import base64
import json
import os
from typing import Any

from argon2.low_level import Type, hash_secret_raw
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

VAULT_VERSION = 1
MIN_PASSPHRASE_LENGTH = 12

# Argon2id parameters (tuned for interactive unlock on a laptop).
KDF_TIME_COST = 3
KDF_MEMORY_KIB = 65536  # 64 MiB
KDF_PARALLELISM = 4
KDF_HASH_LEN = 32
KDF_SALT_LEN = 16

AES_KEY_LEN = 32
GCM_NONCE_LEN = 12


class VaultCryptoError(Exception):
    """Invalid vault data or wrong passphrase."""


def _derive_key(passphrase: str, salt: bytes) -> bytes:
    return hash_secret_raw(
        secret=passphrase.encode("utf-8"),
        salt=salt,
        time_cost=KDF_TIME_COST,
        memory_cost=KDF_MEMORY_KIB,
        parallelism=KDF_PARALLELISM,
        hash_len=KDF_HASH_LEN,
        type=Type.ID,
    )


def encrypt_vault_payload(passphrase: str, inner: dict[str, Any]) -> dict[str, Any]:
    """Build outer JSON dict suitable for writing `vault.json`."""
    salt = os.urandom(KDF_SALT_LEN)
    key = _derive_key(passphrase, salt)
    if len(key) != AES_KEY_LEN:
        raise VaultCryptoError("unexpected derived key length")
    nonce = os.urandom(GCM_NONCE_LEN)
    plaintext = json.dumps(inner, separators=(",", ":"), sort_keys=True).encode("utf-8")
    aes = AESGCM(key)
    ciphertext = aes.encrypt(nonce, plaintext, associated_data=None)
    return {
        "vault_version": VAULT_VERSION,
        "kdf": "argon2id",
        "kdf_salt_b64": base64.standard_b64encode(salt).decode("ascii"),
        "kdf_time_cost": KDF_TIME_COST,
        "kdf_memory_kib": KDF_MEMORY_KIB,
        "kdf_parallelism": KDF_PARALLELISM,
        "payload_nonce_b64": base64.standard_b64encode(nonce).decode("ascii"),
        "payload_ciphertext_b64": base64.standard_b64encode(ciphertext).decode(
            "ascii",
        ),
    }


def decrypt_vault_payload(passphrase: str, envelope: dict[str, Any]) -> dict[str, Any]:
    """Decrypt envelope; returns inner JSON object (e.g. ``{"profiles": [...]}``)."""
    try:
        version = int(envelope["vault_version"])
    except (KeyError, TypeError, ValueError) as e:
        raise VaultCryptoError("invalid vault envelope") from e
    if version != VAULT_VERSION:
        raise VaultCryptoError(f"unsupported vault_version {version}")

    try:
        salt = base64.standard_b64decode(envelope["kdf_salt_b64"])
        nonce = base64.standard_b64decode(envelope["payload_nonce_b64"])
        ciphertext = base64.standard_b64decode(envelope["payload_ciphertext_b64"])
        time_cost = int(envelope["kdf_time_cost"])
        memory_kib = int(envelope["kdf_memory_kib"])
        parallelism = int(envelope["kdf_parallelism"])
    except (KeyError, TypeError, ValueError) as e:
        raise VaultCryptoError("corrupt vault envelope") from e

    key = hash_secret_raw(
        secret=passphrase.encode("utf-8"),
        salt=salt,
        time_cost=time_cost,
        memory_cost=memory_kib,
        parallelism=parallelism,
        hash_len=KDF_HASH_LEN,
        type=Type.ID,
    )
    aes = AESGCM(key)
    try:
        plaintext = aes.decrypt(nonce, ciphertext, associated_data=None)
    except InvalidTag as e:
        raise VaultCryptoError("incorrect passphrase or corrupt vault") from e

    try:
        inner = json.loads(plaintext.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise VaultCryptoError("corrupt vault plaintext") from e
    if not isinstance(inner, dict):
        raise VaultCryptoError("invalid vault structure")
    return inner

"""In-memory Ed25519 profiles loaded from the vault."""

from __future__ import annotations

import base64
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from modulr_keymaster.vault_crypto import VaultCryptoError


@dataclass
class ProfileSecrets:
    """Holds private key material only in RAM after unlock."""

    id: str
    display_name: str
    created_at: str
    private_key: Ed25519PrivateKey

    def public_key_hex(self) -> str:
        raw = self.private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        return raw.hex()

    def to_public_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "display_name": self.display_name,
            "created_at": self.created_at,
            "public_key_hex": self.public_key_hex(),
        }


def _seed_b64_to_key(seed_b64: str) -> Ed25519PrivateKey:
    try:
        seed = base64.standard_b64decode(seed_b64)
    except (ValueError, TypeError) as e:
        raise VaultCryptoError("invalid profile seed encoding") from e
    if len(seed) != 32:
        raise VaultCryptoError("invalid Ed25519 seed length")
    return Ed25519PrivateKey.from_private_bytes(seed)


def _key_to_seed_b64(key: Ed25519PrivateKey) -> str:
    raw = key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return base64.standard_b64encode(raw).decode("ascii")


def inner_payload_to_profiles(inner: dict[str, Any]) -> list[ProfileSecrets]:
    profiles_raw = inner.get("profiles")
    if profiles_raw is None:
        raise VaultCryptoError("missing profiles array")
    if not isinstance(profiles_raw, list):
        raise VaultCryptoError("profiles must be a list")

    out: list[ProfileSecrets] = []
    for item in profiles_raw:
        if not isinstance(item, dict):
            raise VaultCryptoError("invalid profile entry")
        pid = item.get("id")
        name = item.get("display_name")
        created = item.get("created_at")
        seed_b64 = item.get("ed25519_seed_b64")
        if not isinstance(pid, str) or not isinstance(name, str):
            raise VaultCryptoError("invalid profile fields")
        if not isinstance(created, str):
            raise VaultCryptoError("invalid profile created_at")
        if not isinstance(seed_b64, str):
            raise VaultCryptoError("invalid profile seed")
        key = _seed_b64_to_key(seed_b64)
        out.append(
            ProfileSecrets(
                id=pid,
                display_name=name,
                created_at=created,
                private_key=key,
            ),
        )
    return out


def profiles_to_inner_payload(profiles: list[ProfileSecrets]) -> dict[str, Any]:
    rows: list[dict[str, str]] = []
    for p in profiles:
        rows.append(
            {
                "id": p.id,
                "display_name": p.display_name,
                "created_at": p.created_at,
                "ed25519_seed_b64": _key_to_seed_b64(p.private_key),
            },
        )
    return {"profiles": rows}


def empty_inner_payload() -> dict[str, Any]:
    return {"profiles": []}


def new_profile(display_name: str) -> ProfileSecrets:
    """Generate a new random Ed25519 identity."""
    key = Ed25519PrivateKey.generate()
    now = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return ProfileSecrets(
        id=str(uuid.uuid4()),
        display_name=display_name.strip() or "Unnamed",
        created_at=now,
        private_key=key,
    )

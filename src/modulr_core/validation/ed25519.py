"""Ed25519 verification and envelope signing preimage (MVP)."""

from __future__ import annotations

from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from modulr_core.errors.exceptions import InvalidPublicKey, SignatureInvalid
from modulr_core.validation.canonical import canonical_json_bytes


def envelope_signing_bytes(envelope: dict[str, Any]) -> bytes:
    """UTF-8 bytes of canonical JSON of ``envelope`` **without** the ``signature`` key.

    If ``signature`` is absent, this is equivalent to canonical JSON of the whole
    envelope (same bytes a signer would use after dropping ``signature`` only).
    """
    without_sig = {k: v for k, v in envelope.items() if k != "signature"}
    return canonical_json_bytes(without_sig)


def verify_ed25519(public_key: bytes, message: bytes, signature: bytes) -> None:
    """Verify an Ed25519 pure signature over ``message``; raise on failure.

    Raises:
        InvalidPublicKey: ``public_key`` is not 32 valid bytes for Ed25519.
        SignatureInvalid: Wrong signature length, or Ed25519 verify failed.
    """
    if len(public_key) != 32:
        raise InvalidPublicKey(
            f"Ed25519 public key must be 32 bytes, got {len(public_key)}"
        )
    if len(signature) != 64:
        raise SignatureInvalid(
            f"Ed25519 signature must be 64 bytes, got {len(signature)}"
        )
    try:
        pk = Ed25519PublicKey.from_public_bytes(public_key)
    except ValueError as e:
        raise InvalidPublicKey(str(e)) from e
    try:
        pk.verify(signature, message)
    except InvalidSignature as e:
        raise SignatureInvalid("Ed25519 verification failed") from e

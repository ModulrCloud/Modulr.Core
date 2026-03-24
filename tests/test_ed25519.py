"""Phase D: Ed25519 verify and envelope signing preimage."""

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from modulr_core import InvalidPublicKey, SignatureInvalid
from modulr_core.validation import (
    decode_hex_fixed,
    envelope_signing_bytes,
    verify_ed25519,
)


def _sample_envelope() -> dict[str, object]:
    return {
        "protocol_version": "2026.3.22.0",
        "message_id": "m1",
        "target_module": "modulr.core",
        "operation": "lookup_module",
        "payload": {"module_name": "modulr.storage"},
    }


def test_envelope_signing_bytes_strips_signature() -> None:
    base = _sample_envelope()
    with_sig = {**base, "signature": "aa" * 64}
    assert envelope_signing_bytes(with_sig) == envelope_signing_bytes(base)


def test_envelope_signing_bytes_stable_without_signature_key() -> None:
    env = _sample_envelope()
    assert envelope_signing_bytes(env) == envelope_signing_bytes(dict(env))


def test_verify_round_trip() -> None:
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    pub_bytes = public_key.public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    message = envelope_signing_bytes(_sample_envelope())
    signature = private_key.sign(message)
    verify_ed25519(pub_bytes, message, signature)


def test_verify_raises_signature_invalid_on_wrong_sig() -> None:
    private_key = Ed25519PrivateKey.generate()
    pub_bytes = private_key.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    message = b"hello"
    bad_sig = b"\x00" * 64
    with pytest.raises(SignatureInvalid, match="verification failed"):
        verify_ed25519(pub_bytes, message, bad_sig)


def test_verify_raises_signature_invalid_on_tampered_message() -> None:
    private_key = Ed25519PrivateKey.generate()
    pub_bytes = private_key.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    message = b"original"
    signature = private_key.sign(message)
    with pytest.raises(SignatureInvalid):
        verify_ed25519(pub_bytes, message + b"!", signature)


def test_verify_invalid_public_key_length() -> None:
    with pytest.raises(InvalidPublicKey, match="32 bytes"):
        verify_ed25519(b"\x00" * 31, b"m", b"\x00" * 64)


def test_verify_signature_wrong_byte_length() -> None:
    private_key = Ed25519PrivateKey.generate()
    pub_bytes = private_key.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    with pytest.raises(SignatureInvalid, match="64 bytes"):
        verify_ed25519(pub_bytes, b"m", b"\x00" * 63)


def test_decode_hex_then_verify_wire_style() -> None:
    private_key = Ed25519PrivateKey.generate()
    pub_bytes = private_key.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    pub_hex = pub_bytes.hex()
    assert pub_hex == pub_hex.lower()
    round_tripped = decode_hex_fixed(pub_hex, byte_length=32)
    message = envelope_signing_bytes(_sample_envelope())
    sig = private_key.sign(message)
    sig_hex = sig.hex()
    verify_ed25519(round_tripped, message, decode_hex_fixed(sig_hex, byte_length=64))

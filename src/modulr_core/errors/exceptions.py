"""Exceptions for validation and crypto (mapped to wire ``code`` in higher layers)."""


class InvalidHexEncoding(ValueError):
    """Wire hex is not lowercase or not the expected length for the field."""


class InvalidPublicKey(ValueError):
    """Ed25519 public key bytes are invalid (e.g. bad ``from_public_bytes`` input)."""


class SignatureInvalid(Exception):
    """Ed25519 signature verification failed."""

"""Exceptions for validation and crypto (mapped to wire ``code`` in higher layers)."""

from modulr_core.errors.codes import ErrorCode


class ConfigurationError(ValueError):
    """Operator configuration (e.g. TOML) is missing, invalid, or inconsistent."""


class InvalidHexEncoding(ValueError):
    """Wire hex is not lowercase or not the expected length for the field."""


class InvalidPublicKey(ValueError):
    """Ed25519 public key bytes are invalid (e.g. bad ``from_public_bytes`` input)."""


class SignatureInvalid(Exception):
    """Ed25519 signature verification failed."""


class DuplicateMigrationVersionError(ValueError):
    """Two migration ``NNN_*.sql`` files use the same numeric prefix."""


class WireValidationError(Exception):
    """Inbound message failed validation; maps to a wire :class:`ErrorCode`."""

    def __init__(self, message: str, *, code: ErrorCode) -> None:
        self.code = code
        super().__init__(message)

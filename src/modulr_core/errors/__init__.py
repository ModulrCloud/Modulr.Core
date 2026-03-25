"""Protocol error and success code constants."""

from modulr_core.errors.codes import ErrorCode, SuccessCode
from modulr_core.errors.exceptions import (
    ConfigurationError,
    DuplicateMigrationVersionError,
    InvalidHexEncoding,
    InvalidPublicKey,
    SignatureInvalid,
    WireValidationError,
)

__all__ = [
    "ErrorCode",
    "SuccessCode",
    "ConfigurationError",
    "DuplicateMigrationVersionError",
    "InvalidHexEncoding",
    "InvalidPublicKey",
    "SignatureInvalid",
    "WireValidationError",
]

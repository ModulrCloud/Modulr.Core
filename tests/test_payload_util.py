"""payload_util optional field helpers."""

from __future__ import annotations

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from modulr_core import ErrorCode, WireValidationError
from modulr_core.operations.payload_util import (
    optional_ed25519_public_key_hex,
    optional_int,
)


def test_optional_int_absent_and_null() -> None:
    assert optional_int({}, "priority") is None
    assert optional_int({"priority": None}, "priority") is None


def test_optional_int_rejects_bool() -> None:
    with pytest.raises(WireValidationError) as ei:
        optional_int({"priority": True}, "priority")
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_optional_ed25519_public_key_hex_round_trip() -> None:
    pk = Ed25519PrivateKey.generate().public_key()
    h = pk.public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw).hex()
    assert optional_ed25519_public_key_hex({"endpoint_signing_public_key_hex": h}) == h


def test_optional_ed25519_public_key_hex_normalizes_uppercase() -> None:
    pk = Ed25519PrivateKey.generate().public_key()
    lower = pk.public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw).hex()
    upper = lower.upper()
    assert optional_ed25519_public_key_hex(
        {"endpoint_signing_public_key_hex": upper},
    ) == lower

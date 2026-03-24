"""Phase D: wire hex decoding (lowercase only)."""

import pytest

from modulr_core import InvalidHexEncoding
from modulr_core.validation import decode_hex_fixed


def test_decode_32_bytes_ok() -> None:
    h = "ab" * 32
    assert len(decode_hex_fixed(h, byte_length=32)) == 32


def test_decode_64_bytes_ok() -> None:
    h = "cd" * 64
    assert len(decode_hex_fixed(h, byte_length=64)) == 64


def test_decode_rejects_uppercase() -> None:
    h = ("ab" * 31) + "AB"
    with pytest.raises(InvalidHexEncoding, match="lowercase"):
        decode_hex_fixed(h, byte_length=32)


def test_decode_rejects_wrong_length() -> None:
    with pytest.raises(InvalidHexEncoding, match="expected 64"):
        decode_hex_fixed("ab" * 10, byte_length=32)


def test_decode_rejects_non_hex() -> None:
    h = "ab" * 31 + "gg"
    with pytest.raises(InvalidHexEncoding, match="invalid hex"):
        decode_hex_fixed(h, byte_length=32)

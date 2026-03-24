"""Lowercase hex decoding for wire ``sender_public_key`` and ``signature`` strings."""

from __future__ import annotations

from modulr_core.errors.exceptions import InvalidHexEncoding

_HEX = set("0123456789abcdef")


def decode_hex_fixed(s: str, *, byte_length: int) -> bytes:
    """Decode **lowercase** hex string to ``byte_length`` bytes.

    Rejects uppercase, odd length, non-hex characters, or wrong char length
    (expected ``byte_length * 2`` hex digits).
    """
    expected_chars = byte_length * 2
    if len(s) != expected_chars:
        raise InvalidHexEncoding(
            f"expected {expected_chars} hex chars for {byte_length} bytes, "
            f"got {len(s)}",
        )
    if s != s.lower():
        raise InvalidHexEncoding("hex must be lowercase")
    if not all(c in _HEX for c in s):
        raise InvalidHexEncoding("invalid hex character")
    return bytes.fromhex(s)

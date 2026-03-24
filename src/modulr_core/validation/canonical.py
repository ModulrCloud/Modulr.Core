"""Canonical JSON (MVP) for signing input and ``payload_hash`` preimage.

Rules (see plan/validation-and-signing.md):

- UTF-8 bytes of one JSON text (no insignificant whitespace).
- Object keys sorted lexicographically at every nesting level
  (Unicode code-point order).
- Array order preserved.
- ``true`` / ``false`` / ``null``; numbers via :func:`json.dumps` (``allow_nan=False``).

Implementation: :func:`json.dumps` with ``sort_keys=True``,
``separators=(\",\", \":\")``, ``ensure_ascii=False`` (UTF-8 text in strings,
not ``\\uXXXX`` escapes for non-ASCII).
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def canonical_json_str(value: Any) -> str:
    """Return canonical JSON text (compact, sorted keys)."""
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    )


def canonical_json_bytes(value: Any) -> bytes:
    """Return UTF-8 encoding of :func:`canonical_json_str`."""
    return canonical_json_str(value).encode("utf-8")


def payload_hash(value: Any) -> str:
    """SHA-256 hex of canonical JSON bytes of ``value`` (wire ``payload_hash``)."""
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()

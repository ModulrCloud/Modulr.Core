"""Types produced by the inbound message pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ValidatedInbound:
    """A verified Modulr.Core request envelope and decoded identity material."""

    envelope: dict[str, Any]
    sender_public_key: bytes
    signing_preimage: bytes
    request_fingerprint: bytes
    is_replay: bool

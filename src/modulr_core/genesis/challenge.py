"""Genesis challenge v1: multiline UTF-8 body, Ed25519 verify, 5-minute TTL."""

from __future__ import annotations

import re
import secrets
from collections.abc import Callable
from dataclasses import dataclass

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from modulr_core.repositories.core_genesis import CoreGenesisRepository
from modulr_core.repositories.genesis_challenge import GenesisChallengeRepository
from modulr_core.validation.hex_codec import InvalidHexEncoding, decode_hex_fixed

GENESIS_CHALLENGE_FORMAT_VERSION = "modulr-genesis-challenge-v1"
CHALLENGE_PURPOSE = "prove_bootstrap_operator"
CHALLENGE_TTL_SECONDS = 300

_NONCE_HEX_RE = re.compile(r"^[0-9a-f]{64}$")
_INSTANCE_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


class GenesisChallengeError(Exception):
    """Invalid challenge, signature, expiry, or bootstrap state."""


@dataclass(frozen=True, slots=True)
class IssuedGenesisChallenge:
    """A newly issued challenge (store `body` and sign it with the operator key)."""

    challenge_id: str
    body: str
    issued_at_unix: int
    expires_at_unix: int


def _validate_instance_id(instance_id: str) -> None:
    s = instance_id.strip()
    if not s or len(s) > 128:
        raise GenesisChallengeError("invalid instance_id")
    if not _INSTANCE_ID_RE.match(s):
        raise GenesisChallengeError("invalid instance_id")


def _validate_nonce_hex(nonce_hex: str) -> None:
    if not _NONCE_HEX_RE.match(nonce_hex):
        raise GenesisChallengeError("invalid challenge nonce")


def _validate_bootstrap_pubkey_hex(pubkey_hex: str) -> bytes:
    try:
        raw = decode_hex_fixed(pubkey_hex, byte_length=32)
    except InvalidHexEncoding as e:
        raise GenesisChallengeError("invalid subject_signing_pubkey_hex") from e
    try:
        Ed25519PublicKey.from_public_bytes(raw)
    except ValueError as e:
        raise GenesisChallengeError("invalid Ed25519 public key") from e
    return raw


def build_genesis_challenge_v1_body(
    *,
    instance_id: str,
    nonce_hex: str,
    issued_at_unix: int,
    expires_at_unix: int,
    subject_signing_pubkey_hex: str,
) -> str:
    """Build the canonical multiline UTF-8 challenge body (no trailing newline).

    Keymaster must sign ``body.encode("utf-8")`` with the bootstrap operator key.
    """
    _validate_instance_id(instance_id)
    _validate_nonce_hex(nonce_hex)
    pk = subject_signing_pubkey_hex.strip().lower()
    _validate_bootstrap_pubkey_hex(pk)
    if issued_at_unix < 0 or expires_at_unix < 0:
        raise GenesisChallengeError("invalid unix timestamps")
    if expires_at_unix <= issued_at_unix:
        raise GenesisChallengeError("expires_at_unix must be after issued_at_unix")

    lines = [
        GENESIS_CHALLENGE_FORMAT_VERSION,
        f"instance_id: {instance_id.strip()}",
        f"nonce: {nonce_hex}",
        f"issued_at_unix: {issued_at_unix}",
        f"expires_at_unix: {expires_at_unix}",
        f"subject_signing_pubkey_hex: {pk}",
        f"purpose: {CHALLENGE_PURPOSE}",
    ]
    return "\n".join(lines)


def verify_genesis_challenge_signature(
    *,
    body: str,
    signature_hex: str,
    expected_subject_pubkey_hex: str,
) -> None:
    """Verify Ed25519 signature over UTF-8 bytes of ``body``."""
    pk_hex = expected_subject_pubkey_hex.strip().lower()
    pk_raw = _validate_bootstrap_pubkey_hex(pk_hex)
    try:
        sig = decode_hex_fixed(signature_hex, byte_length=64)
    except InvalidHexEncoding as e:
        raise GenesisChallengeError("invalid signature hex") from e
    pub = Ed25519PublicKey.from_public_bytes(pk_raw)
    try:
        pub.verify(sig, body.encode("utf-8"))
    except InvalidSignature as e:
        raise GenesisChallengeError("signature verification failed") from e


class GenesisChallengeService:
    """Issue and verify one-shot genesis challenges (SQLite-backed)."""

    def __init__(
        self,
        *,
        genesis_repo: CoreGenesisRepository,
        challenge_repo: GenesisChallengeRepository,
        clock: Callable[[], int],
    ) -> None:
        self._genesis = genesis_repo
        self._challenges = challenge_repo
        self._clock = clock

    def issue(self, *, subject_signing_pubkey_hex: str) -> IssuedGenesisChallenge:
        snap = self._genesis.get()
        if snap.genesis_complete:
            raise GenesisChallengeError("genesis already complete")
        now = int(self._clock())
        self._genesis.touch(updated_at=now)
        instance_id = self._genesis.get_or_create_instance_id(updated_at=now)
        challenge_id = secrets.token_hex(32)
        expires_at = now + CHALLENGE_TTL_SECONDS
        body = build_genesis_challenge_v1_body(
            instance_id=instance_id,
            nonce_hex=challenge_id,
            issued_at_unix=now,
            expires_at_unix=expires_at,
            subject_signing_pubkey_hex=subject_signing_pubkey_hex,
        )
        self._challenges.insert(
            challenge_id=challenge_id,
            subject_signing_pubkey_hex=subject_signing_pubkey_hex.strip().lower(),
            body=body,
            issued_at=now,
            expires_at=expires_at,
        )
        return IssuedGenesisChallenge(
            challenge_id=challenge_id,
            body=body,
            issued_at_unix=now,
            expires_at_unix=expires_at,
        )

    def verify_and_consume(self, *, challenge_id: str, signature_hex: str) -> None:
        snap = self._genesis.get()
        if snap.genesis_complete:
            raise GenesisChallengeError("genesis already complete")
        now = int(self._clock())
        row = self._challenges.get_by_id(challenge_id)
        if row is None:
            raise GenesisChallengeError("unknown challenge_id")
        if row.consumed_at is not None:
            raise GenesisChallengeError("challenge already consumed")
        if now >= row.expires_at:
            raise GenesisChallengeError("challenge expired")
        verify_genesis_challenge_signature(
            body=row.body,
            signature_hex=signature_hex,
            expected_subject_pubkey_hex=row.subject_signing_pubkey_hex,
        )
        self._challenges.mark_consumed(challenge_id, consumed_at=now)
        self._genesis.touch(updated_at=now)

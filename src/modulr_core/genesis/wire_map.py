"""Map genesis domain exceptions to wire :class:`ErrorCode` values (HTTP + CLI)."""

from __future__ import annotations

from modulr_core.errors.codes import ErrorCode
from modulr_core.genesis.challenge import GenesisChallengeError
from modulr_core.genesis.completion import GenesisCompletionError

_GENESIS_CHALLENGE_MSG_TO_CODE: dict[str, ErrorCode] = {
    "genesis already complete": ErrorCode.GENESIS_ALREADY_COMPLETE,
    "unknown challenge_id": ErrorCode.GENESIS_CHALLENGE_NOT_FOUND,
    "challenge already consumed": ErrorCode.GENESIS_CHALLENGE_CONSUMED,
    "challenge expired": ErrorCode.GENESIS_CHALLENGE_EXPIRED,
    "invalid subject_signing_pubkey_hex": ErrorCode.PUBLIC_KEY_INVALID,
    "invalid Ed25519 public key": ErrorCode.PUBLIC_KEY_INVALID,
    "invalid signature hex": ErrorCode.INVALID_FIELD,
    "signature verification failed": ErrorCode.SIGNATURE_INVALID,
}


def wire_error_for_genesis_completion(exc: GenesisCompletionError) -> ErrorCode:
    """Map a genesis completion exception to a wire ``ErrorCode``."""
    msg = str(exc)
    if msg == "genesis already complete":
        return ErrorCode.GENESIS_ALREADY_COMPLETE
    if msg == "unknown challenge_id":
        return ErrorCode.GENESIS_CHALLENGE_NOT_FOUND
    if msg.startswith("challenge not verified"):
        return ErrorCode.GENESIS_CHALLENGE_NOT_CONSUMED
    if "does not match the verified challenge" in msg:
        return ErrorCode.GENESIS_OPERATOR_SUBJECT_MISMATCH
    if msg.startswith("genesis completion window expired"):
        return ErrorCode.GENESIS_COMPLETION_WINDOW_EXPIRED
    if "invalid challenge_id" in msg:
        return ErrorCode.INVALID_REQUEST
    if "root_organization_name" in msg or "single DNS label" in msg:
        return ErrorCode.INVALID_NAME
    if (
        "root_organization_signing_public_key_hex" in msg
        or "invalid Ed25519 public key for organization" in msg
    ):
        return ErrorCode.PUBLIC_KEY_INVALID
    if "operator_display_name" in msg:
        return ErrorCode.INVALID_REQUEST
    if (
        "root_organization_logo_svg" in msg
        or "bootstrap operator profile" in msg
        or "bootstrap_operator_profile_image" in msg
    ):
        return ErrorCode.INVALID_REQUEST
    if "already bound" in msg:
        return ErrorCode.NAME_ALREADY_BOUND
    return ErrorCode.INVALID_REQUEST


def wire_error_for_genesis_challenge(exc: GenesisChallengeError) -> ErrorCode:
    """Map a genesis challenge exception to a wire ``ErrorCode``."""
    msg = str(exc)
    return _GENESIS_CHALLENGE_MSG_TO_CODE.get(msg, ErrorCode.INVALID_REQUEST)

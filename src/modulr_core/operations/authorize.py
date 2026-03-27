"""Authorization rules after envelope verification."""

from __future__ import annotations

from modulr_core.config.schema import Settings
from modulr_core.errors.codes import ErrorCode
from modulr_core.errors.exceptions import WireValidationError


def require_bootstrap_to_register_module(
    *,
    settings: Settings,
    sender_public_key_hex: str,
) -> None:
    """Only bootstrap keys may ``register_module`` when a list is configured.

    If ``dev_mode`` is true and the bootstrap list is empty, any verified sender
    is allowed (same rule as the inbound pipeline).
    """
    allowed = settings.bootstrap_public_keys
    if not allowed and settings.dev_mode:
        return
    if sender_public_key_hex not in allowed:
        raise WireValidationError(
            "only bootstrap keys may register modules",
            code=ErrorCode.UNAUTHORIZED,
        )

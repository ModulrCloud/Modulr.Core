"""Authorization rules after envelope verification."""

from __future__ import annotations

import sqlite3

from modulr_core.bootstrap_effective import sender_is_effective_bootstrap
from modulr_core.config.schema import Settings
from modulr_core.errors.codes import ErrorCode
from modulr_core.errors.exceptions import WireValidationError


def require_bootstrap_sender(
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    sender_public_key_hex: str,
) -> None:
    """Only bootstrap keys may run privileged registry operations when configured.

    If ``dev_mode`` is true and the bootstrap list is empty, any verified sender
    is allowed (same rule as the inbound pipeline). After genesis completion, the
    operator key stored in ``core_genesis`` is always treated as bootstrap even if
    it is not duplicated in ``bootstrap_public_keys``.
    """
    if not sender_is_effective_bootstrap(
        sender_public_key_hex,
        settings=settings,
        conn=conn,
    ):
        raise WireValidationError(
            "only bootstrap keys may perform this operation",
            code=ErrorCode.UNAUTHORIZED,
        )


def require_bootstrap_to_register_module(
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    sender_public_key_hex: str,
) -> None:
    """Only bootstrap keys may ``register_module`` when a list is configured."""
    require_bootstrap_sender(
        settings=settings,
        conn=conn,
        sender_public_key_hex=sender_public_key_hex,
    )

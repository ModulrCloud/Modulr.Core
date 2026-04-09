"""Effective bootstrap allowlist: config keys plus genesis operator when complete."""

from __future__ import annotations

import sqlite3

from modulr_core.config.schema import Settings
from modulr_core.repositories.core_genesis import CoreGenesisRepository


def normalize_ed25519_public_key_hex(pub_hex: str) -> str:
    """Return lowercase hex for stable comparisons (envelope vs config vs DB)."""
    return pub_hex.strip().lower()


def sender_is_effective_bootstrap(
    sender_public_key_hex: str,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
) -> bool:
    """Return whether the sender may act as bootstrap for inbound messages and ops.

    When ``dev_mode`` is true and ``bootstrap_public_keys`` is empty, any verified
    sender is allowed (unchanged). Otherwise the sender must appear in
    ``bootstrap_public_keys`` **or**, after a completed genesis wizard, match
    ``core_genesis.bootstrap_signing_pubkey_hex``.
    """
    if not settings.bootstrap_public_keys and settings.dev_mode:
        return True
    norm_sender = normalize_ed25519_public_key_hex(sender_public_key_hex)
    allowed = {
        normalize_ed25519_public_key_hex(k) for k in settings.bootstrap_public_keys
    }
    snap = CoreGenesisRepository(conn).get()
    if snap.genesis_complete and snap.bootstrap_signing_pubkey_hex:
        allowed.add(
            normalize_ed25519_public_key_hex(snap.bootstrap_signing_pubkey_hex),
        )
    return norm_sender in allowed

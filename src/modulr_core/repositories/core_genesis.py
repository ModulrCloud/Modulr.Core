"""Singleton ``core_genesis`` row: wizard completion + bootstrap signing pubkey."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from modulr_core.validation.hex_codec import InvalidHexEncoding, decode_hex_fixed

_MODULR_APEX_DOMAIN_MAX_LEN = 253


@dataclass(frozen=True)
class CoreGenesisSnapshot:
    """Read model for :class:`CoreGenesisRepository`."""

    genesis_complete: bool
    bootstrap_signing_pubkey_hex: str | None
    modulr_apex_domain: str | None
    updated_at: int


def _validate_bootstrap_pubkey_hex(pub_hex: str) -> None:
    try:
        raw = decode_hex_fixed(pub_hex, byte_length=32)
    except InvalidHexEncoding as e:
        raise ValueError(str(e)) from e
    try:
        Ed25519PublicKey.from_public_bytes(raw)
    except ValueError as e:
        raise ValueError(f"invalid Ed25519 public key: {e}") from e


def _validate_apex_domain(domain: str) -> str:
    d = domain.strip()
    if not d:
        raise ValueError("modulr_apex_domain must be non-empty when set")
    if len(d) > _MODULR_APEX_DOMAIN_MAX_LEN:
        mx = _MODULR_APEX_DOMAIN_MAX_LEN
        raise ValueError(f"modulr_apex_domain must be at most {mx} characters")
    return d


class CoreGenesisRepository:
    """Read/update the single ``core_genesis`` row (migration ``007`` seeds it)."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self) -> CoreGenesisSnapshot:
        cur = self._conn.execute(
            """
            SELECT genesis_complete, bootstrap_signing_pubkey_hex,
                   modulr_apex_domain, updated_at
            FROM core_genesis
            WHERE singleton = 1
            """,
        )
        row = cur.fetchone()
        if row is None:
            raise RuntimeError("core_genesis singleton missing; run apply_migrations")
        complete = int(row["genesis_complete"]) == 1
        pk = row["bootstrap_signing_pubkey_hex"]
        pk_s = str(pk) if pk is not None else None
        apex = row["modulr_apex_domain"]
        apex_s = str(apex).strip() if apex is not None and str(apex).strip() else None
        return CoreGenesisSnapshot(
            genesis_complete=complete,
            bootstrap_signing_pubkey_hex=pk_s,
            modulr_apex_domain=apex_s,
            updated_at=int(row["updated_at"]),
        )

    def set_genesis_complete(self, *, complete: bool, updated_at: int) -> None:
        self._conn.execute(
            """
            UPDATE core_genesis
            SET genesis_complete = ?, updated_at = ?
            WHERE singleton = 1
            """,
            (1 if complete else 0, updated_at),
        )

    def set_bootstrap_signing_pubkey_hex(
        self,
        *,
        pubkey_hex: str | None,
        updated_at: int,
    ) -> None:
        if pubkey_hex is not None:
            _validate_bootstrap_pubkey_hex(pubkey_hex)
        self._conn.execute(
            """
            UPDATE core_genesis
            SET bootstrap_signing_pubkey_hex = ?, updated_at = ?
            WHERE singleton = 1
            """,
            (pubkey_hex, updated_at),
        )

    def set_modulr_apex_domain(
        self,
        *,
        apex_domain: str | None,
        updated_at: int,
    ) -> None:
        if apex_domain is not None:
            apex_domain = _validate_apex_domain(apex_domain)
        self._conn.execute(
            """
            UPDATE core_genesis
            SET modulr_apex_domain = ?, updated_at = ?
            WHERE singleton = 1
            """,
            (apex_domain, updated_at),
        )

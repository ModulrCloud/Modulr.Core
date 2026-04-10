"""SQLite persistence for one-shot genesis challenges."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class GenesisChallengeRow:
    """Stored challenge row (body is exact UTF-8 text for signing)."""

    challenge_id: str
    subject_signing_pubkey_hex: str
    body: str
    issued_at: int
    expires_at: int
    consumed_at: int | None


class GenesisChallengeRepository:
    """Persistence for ``genesis_challenge`` (one row per ``challenge_id``)."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def insert(
        self,
        *,
        challenge_id: str,
        subject_signing_pubkey_hex: str,
        body: str,
        issued_at: int,
        expires_at: int,
    ) -> None:
        self._conn.execute(
            """
            INSERT INTO genesis_challenge (
                challenge_id,
                subject_signing_pubkey_hex,
                body,
                issued_at,
                expires_at,
                consumed_at
            ) VALUES (?, ?, ?, ?, ?, NULL)
            """,
            (challenge_id, subject_signing_pubkey_hex, body, issued_at, expires_at),
        )

    def get_by_id(self, challenge_id: str) -> GenesisChallengeRow | None:
        cur = self._conn.execute(
            """
            SELECT
                challenge_id,
                subject_signing_pubkey_hex,
                body,
                issued_at,
                expires_at,
                consumed_at
            FROM genesis_challenge WHERE challenge_id = ?
            """,
            (challenge_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return _row_to_challenge(row)

    def mark_consumed(self, challenge_id: str, *, consumed_at: int) -> bool:
        """
        Set ``consumed_at`` on a pending challenge (conditional single-use consume).

        Args:
            challenge_id: Primary key of the challenge row.
            consumed_at: Unix seconds at consume time.

        Returns:
            True if exactly one row was updated. False if the row was missing or
            ``consumed_at`` was already set (including lost races between readers
            and this update).
        """
        cur = self._conn.execute(
            """
            UPDATE genesis_challenge SET consumed_at = ?
            WHERE challenge_id = ? AND consumed_at IS NULL
            """,
            (consumed_at, challenge_id),
        )
        return cur.rowcount == 1

    def delete_all(self) -> int:
        """Remove every challenge row; returns deleted row count."""
        cur = self._conn.execute("DELETE FROM genesis_challenge")
        return int(cur.rowcount)


def _row_to_challenge(row: sqlite3.Row | tuple[Any, ...]) -> GenesisChallengeRow:
    if isinstance(row, sqlite3.Row):
        cid = row["challenge_id"]
        pk = row["subject_signing_pubkey_hex"]
        body = row["body"]
        issued_at = int(row["issued_at"])
        expires_at = int(row["expires_at"])
        consumed = row["consumed_at"]
    else:
        cid, pk, body, issued_at, expires_at, consumed = row
        issued_at = int(issued_at)
        expires_at = int(expires_at)
    consumed_at: int | None = None if consumed is None else int(consumed)
    return GenesisChallengeRow(
        challenge_id=str(cid),
        subject_signing_pubkey_hex=str(pk),
        body=str(body),
        issued_at=issued_at,
        expires_at=expires_at,
        consumed_at=consumed_at,
    )

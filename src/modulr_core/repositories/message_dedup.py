"""``message_dedup`` replay / idempotency cache."""

from __future__ import annotations

import sqlite3
from typing import Any


class MessageDedupRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def insert(
        self,
        *,
        message_id: str,
        request_fingerprint: bytes,
        result_summary: str,
        first_seen_at: int,
    ) -> None:
        self._conn.execute(
            """
            INSERT INTO message_dedup (
                message_id, request_fingerprint, result_summary, first_seen_at
            ) VALUES (?, ?, ?, ?)
            """,
            (message_id, request_fingerprint, result_summary, first_seen_at),
        )

    def get_by_message_id(self, message_id: str) -> dict[str, Any] | None:
        cur = self._conn.execute(
            "SELECT * FROM message_dedup WHERE message_id = ?",
            (message_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None

    def delete_older_than(self, cutoff_epoch: int) -> int:
        cur = self._conn.execute(
            "DELETE FROM message_dedup WHERE first_seen_at < ?",
            (cutoff_epoch,),
        )
        return cur.rowcount

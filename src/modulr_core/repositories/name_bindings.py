"""``name_bindings`` table."""

from __future__ import annotations

import sqlite3
from typing import Any


class NameBindingsRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def insert(
        self,
        *,
        name: str,
        resolved_id: str,
        route_json: str | None,
        metadata_json: str | None,
        created_at: int,
    ) -> None:
        self._conn.execute(
            """
            INSERT INTO name_bindings (
                name, resolved_id, route_json, metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (name, resolved_id, route_json, metadata_json, created_at),
        )

    def get_by_name(self, name: str) -> dict[str, Any] | None:
        cur = self._conn.execute(
            "SELECT * FROM name_bindings WHERE name = ?",
            (name,),
        )
        row = cur.fetchone()
        return dict(row) if row else None

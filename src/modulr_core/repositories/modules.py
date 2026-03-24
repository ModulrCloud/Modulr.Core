"""``modules`` table."""

from __future__ import annotations

import sqlite3
from typing import Any


class ModulesRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def insert(
        self,
        *,
        module_name: str,
        module_version: str,
        route_json: str,
        capabilities_json: str | None,
        metadata_json: str | None,
        signing_public_key: bytes,
        registered_by_sender_id: str,
        registered_at: int,
    ) -> None:
        self._conn.execute(
            """
            INSERT INTO modules (
                module_name, module_version, route_json, capabilities_json,
                metadata_json, signing_public_key, registered_by_sender_id,
                registered_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                module_name,
                module_version,
                route_json,
                capabilities_json,
                metadata_json,
                signing_public_key,
                registered_by_sender_id,
                registered_at,
            ),
        )

    def get_by_name(self, module_name: str) -> dict[str, Any] | None:
        cur = self._conn.execute(
            "SELECT * FROM modules WHERE module_name = ?",
            (module_name,),
        )
        row = cur.fetchone()
        return dict(row) if row else None

    def exists(self, module_name: str) -> bool:
        cur = self._conn.execute(
            "SELECT 1 FROM modules WHERE module_name = ?",
            (module_name,),
        )
        return cur.fetchone() is not None

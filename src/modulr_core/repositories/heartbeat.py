"""``heartbeat_state`` table."""

from __future__ import annotations

import sqlite3
from typing import Any


class HeartbeatRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def upsert(
        self,
        *,
        module_name: str,
        module_version: str,
        status: str,
        route_json: str | None,
        metrics_json: str | None,
        last_seen_at: int,
    ) -> None:
        self._conn.execute(
            """
            INSERT INTO heartbeat_state (
                module_name, module_version, status, route_json,
                metrics_json, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(module_name) DO UPDATE SET
                module_version = excluded.module_version,
                status = excluded.status,
                route_json = excluded.route_json,
                metrics_json = excluded.metrics_json,
                last_seen_at = excluded.last_seen_at
            """,
            (
                module_name,
                module_version,
                status,
                route_json,
                metrics_json,
                last_seen_at,
            ),
        )

    def get_by_module_name(self, module_name: str) -> dict[str, Any] | None:
        cur = self._conn.execute(
            "SELECT * FROM heartbeat_state WHERE module_name = ?",
            (module_name,),
        )
        row = cur.fetchone()
        return dict(row) if row else None

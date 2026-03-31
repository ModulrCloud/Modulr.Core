"""Persisted advertised route for built-in ``modulr.core`` (singleton row)."""

from __future__ import annotations

import sqlite3


class CoreAdvertisedRouteRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get_route_json(self) -> str | None:
        cur = self._conn.execute(
            "SELECT route_json FROM core_advertised_route WHERE singleton = 1",
        )
        row = cur.fetchone()
        if row is None:
            return None
        rj = row["route_json"]
        if isinstance(rj, memoryview):
            rj = rj.tobytes().decode("utf-8")
        return str(rj) if rj else None

    def upsert(self, *, route_json: str, updated_at: int) -> None:
        self._conn.execute(
            """
            INSERT INTO core_advertised_route (singleton, route_json, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT (singleton) DO UPDATE SET
                route_json = excluded.route_json,
                updated_at = excluded.updated_at
            """,
            (route_json, updated_at),
        )

"""``module_state_snapshot`` table (latest ``report_module_state`` per module)."""

from __future__ import annotations

import sqlite3
from typing import Any


class ModuleStateSnapshotRepository:
    """Upsert and read per-module state Phase/detail from ``report_module_state``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def upsert(
        self,
        *,
        module_name: str,
        state_phase: str,
        detail: str | None,
        reported_at: int,
    ) -> None:
        self._conn.execute(
            """
            INSERT INTO module_state_snapshot (
                module_name, state_phase, detail, reported_at
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(module_name) DO UPDATE SET
                state_phase = excluded.state_phase,
                detail = excluded.detail,
                reported_at = excluded.reported_at
            """,
            (module_name, state_phase, detail, reported_at),
        )

    def get_by_module_name(self, module_name: str) -> dict[str, Any] | None:
        cur = self._conn.execute(
            "SELECT * FROM module_state_snapshot WHERE module_name = ?",
            (module_name,),
        )
        row = cur.fetchone()
        return dict(row) if row else None

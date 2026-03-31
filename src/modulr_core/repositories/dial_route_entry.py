"""``dial_route_entry`` table — multiple ordered dials per scope."""

from __future__ import annotations

import sqlite3
from collections.abc import Sequence
from typing import Any


class DialRouteEntryRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def list_by_scope(self, scope: str) -> list[dict[str, Any]]:
        cur = self._conn.execute(
            """
            SELECT id, scope, route_type, route, priority,
                   endpoint_signing_public_key_hex, created_at, updated_at
            FROM dial_route_entry
            WHERE scope = ?
            ORDER BY priority ASC, id ASC
            """,
            (scope,),
        )
        return [dict(row) for row in cur.fetchall()]

    def upsert_merge(
        self,
        *,
        scope: str,
        route_type: str,
        route: str,
        priority: int,
        endpoint_signing_public_key_hex: str | None,
        now: int,
    ) -> None:
        """Insert or update dial; ``created_at`` is preserved on conflict."""
        self._conn.execute(
            """
            INSERT INTO dial_route_entry (
                scope, route_type, route, priority,
                endpoint_signing_public_key_hex, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(scope, route_type, route) DO UPDATE SET
                priority = excluded.priority,
                endpoint_signing_public_key_hex =
                    excluded.endpoint_signing_public_key_hex,
                updated_at = excluded.updated_at
            """,
            (
                scope,
                route_type,
                route,
                priority,
                endpoint_signing_public_key_hex,
                now,
                now,
            ),
        )

    def delete_all_for_scope(self, scope: str) -> int:
        cur = self._conn.execute(
            "DELETE FROM dial_route_entry WHERE scope = ?",
            (scope,),
        )
        return cur.rowcount

    def replace_all_for_scope(
        self,
        *,
        scope: str,
        entries: Sequence[tuple[str, str, int, str | None]],
        now: int,
    ) -> None:
        """Replace every dial for ``scope`` with ``entries``.

        Each entry is ``(route_type, route, priority, pubkey_hex_or_none)``.
        """
        self.delete_all_for_scope(scope)
        for route_type, route, priority, pubkey_hex in entries:
            self._conn.execute(
                """
                INSERT INTO dial_route_entry (
                    scope, route_type, route, priority,
                    endpoint_signing_public_key_hex, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (scope, route_type, route, priority, pubkey_hex, now, now),
            )

    def delete_by_scope_and_dial(
        self,
        *,
        scope: str,
        route_type: str,
        route: str,
    ) -> bool:
        cur = self._conn.execute(
            """
            DELETE FROM dial_route_entry
            WHERE scope = ? AND route_type = ? AND route = ?
            """,
            (scope, route_type, route),
        )
        return cur.rowcount > 0

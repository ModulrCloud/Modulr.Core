"""Apply ordered ``NNN_*.sql`` migrations once each."""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path


def migrations_dir() -> Path:
    """Directory containing ``001_initial.sql``, etc."""
    return Path(__file__).resolve().parent / "migrations"


def _migration_files() -> list[tuple[int, Path]]:
    out: list[tuple[int, Path]] = []
    for path in sorted(migrations_dir().glob("*.sql")):
        prefix = path.name.split("_", 1)[0]
        if prefix.isdigit():
            out.append((int(prefix), path))
    return sorted(out, key=lambda x: x[0])


def apply_migrations(conn: sqlite3.Connection) -> None:
    """Ensure ``schema_migrations`` exists, then apply pending ``NNN_*.sql`` files."""
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )
        """
    )
    conn.commit()

    for version, path in _migration_files():
        cur = conn.execute(
            "SELECT 1 FROM schema_migrations WHERE version = ?",
            (version,),
        )
        if cur.fetchone():
            continue
        sql = path.read_text(encoding="utf-8")
        conn.executescript(sql)
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
            (version, int(time.time())),
        )
        conn.commit()

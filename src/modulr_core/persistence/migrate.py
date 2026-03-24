"""Apply ordered ``NNN_*.sql`` migrations once each."""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

from modulr_core.errors.exceptions import DuplicateMigrationVersionError


def migrations_dir() -> Path:
    """Directory containing ``001_initial.sql``, etc."""
    return Path(__file__).resolve().parent / "migrations"


def _migration_files() -> list[tuple[int, Path]]:
    raw: list[tuple[int, Path]] = []
    for path in sorted(migrations_dir().glob("*.sql")):
        prefix = path.name.split("_", 1)[0]
        if prefix.isdigit():
            raw.append((int(prefix), path))

    by_version: dict[int, Path] = {}
    for version, path in sorted(raw, key=lambda x: (x[0], str(x[1]))):
        if version in by_version:
            raise DuplicateMigrationVersionError(
                f"duplicate migration version {version}: "
                f"{by_version[version].name!r} and {path.name!r}",
            )
        by_version[version] = path
    return sorted(by_version.items(), key=lambda x: x[0])


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
        applied_at = int(time.time())
        # One ``executescript`` so migration DDL and version row are atomic
        # (avoids applied DDL without a recorded version if the INSERT failed).
        conn.executescript(
            f"{sql.rstrip()}\n"
            f"INSERT INTO schema_migrations (version, applied_at) "
            f"VALUES ({version}, {applied_at});\n"
        )
        conn.commit()

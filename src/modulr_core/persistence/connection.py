"""Open SQLite connections with Row factory and foreign keys enabled."""

from __future__ import annotations

import sqlite3
from pathlib import Path


def open_database(path: str | Path) -> sqlite3.Connection:
    """Return a connection with Row factory and ``PRAGMA foreign_keys=ON``."""
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def connect_memory() -> sqlite3.Connection:
    """In-memory DB for tests (same pragmas as :func:`open_database`)."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

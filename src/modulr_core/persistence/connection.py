"""Open SQLite connections with Row factory and foreign keys enabled."""

from __future__ import annotations

import sqlite3
from pathlib import Path


def open_database(
    path: str | Path,
    *,
    check_same_thread: bool = True,
) -> sqlite3.Connection:
    """Return a connection with Row factory and ``PRAGMA foreign_keys=ON``.

    Set ``check_same_thread=False`` when the connection is shared across
    threads (e.g. FastAPI with a single long-lived connection).
    """
    conn = sqlite3.connect(str(path), check_same_thread=check_same_thread)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def connect_memory(*, check_same_thread: bool = True) -> sqlite3.Connection:
    """In-memory DB for tests (same pragmas as :func:`open_database`)."""
    conn = sqlite3.connect(":memory:", check_same_thread=check_same_thread)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

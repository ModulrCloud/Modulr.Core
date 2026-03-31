"""Phase E: migrations and repositories."""

import sqlite3

import pytest

from modulr_core import DuplicateMigrationVersionError
from modulr_core.persistence import apply_migrations, connect_memory, open_database
from modulr_core.persistence import migrate as migrate_mod
from modulr_core.repositories import (
    DialRouteEntryRepository,
    HeartbeatRepository,
    MessageDedupRepository,
    ModulesRepository,
    NameBindingsRepository,
)


@pytest.fixture
def conn() -> sqlite3.Connection:
    c = connect_memory()
    apply_migrations(c)
    return c


def test_migrations_idempotent(conn: sqlite3.Connection) -> None:
    apply_migrations(conn)
    n = conn.execute("SELECT COUNT(*) AS n FROM schema_migrations").fetchone()["n"]
    assert n >= 1
    apply_migrations(conn)
    assert (
        conn.execute("SELECT COUNT(*) AS n FROM schema_migrations").fetchone()["n"]
        == n
    )


def test_modules_insert_and_get(conn: sqlite3.Connection) -> None:
    repo = ModulesRepository(conn)
    key = b"\xab" * 32
    repo.insert(
        module_name="modulr.storage",
        module_version="2026.3.22.0",
        route_json='{"base_url":"https://example.invalid"}',
        capabilities_json="[]",
        metadata_json=None,
        signing_public_key=key,
        registered_by_sender_id="user:bootstrap",
        registered_at=1_700_000_000,
    )
    conn.commit()
    row = repo.get_by_name("modulr.storage")
    assert row is not None
    assert row["module_name"] == "modulr.storage"
    assert row["signing_public_key"] == key
    assert repo.exists("modulr.storage")


def test_modules_duplicate_primary_key(conn: sqlite3.Connection) -> None:
    repo = ModulesRepository(conn)
    kwargs = dict(
        module_name="modulr.x",
        module_version="2026.3.22.0",
        route_json="{}",
        capabilities_json=None,
        metadata_json=None,
        signing_public_key=b"\x00" * 32,
        registered_by_sender_id="a",
        registered_at=1,
    )
    repo.insert(**kwargs)
    conn.commit()
    with pytest.raises(sqlite3.IntegrityError):
        repo.insert(**kwargs)


def test_heartbeat_fk_requires_module(conn: sqlite3.Connection) -> None:
    hb = HeartbeatRepository(conn)
    with pytest.raises(sqlite3.IntegrityError):
        hb.upsert(
            module_name="missing.module",
            module_version="2026.3.22.0",
            status="healthy",
            route_json=None,
            metrics_json=None,
            last_seen_at=2,
        )
        conn.commit()


def test_heartbeat_upsert_after_module(conn: sqlite3.Connection) -> None:
    m = ModulesRepository(conn)
    m.insert(
        module_name="modulr.y",
        module_version="2026.3.22.0",
        route_json="{}",
        capabilities_json=None,
        metadata_json=None,
        signing_public_key=b"\x01" * 32,
        registered_by_sender_id="a",
        registered_at=1,
    )
    conn.commit()
    hb = HeartbeatRepository(conn)
    hb.upsert(
        module_name="modulr.y",
        module_version="2026.3.22.1",
        status="degraded",
        route_json=None,
        metrics_json='{"q":1}',
        last_seen_at=99,
    )
    conn.commit()
    row = hb.get_by_module_name("modulr.y")
    assert row is not None
    assert row["status"] == "degraded"
    assert row["last_seen_at"] == 99


def test_name_bindings_list_by_resolved_id(conn: sqlite3.Connection) -> None:
    nb = NameBindingsRepository(conn)
    nb.insert(
        name="alice@acme.network",
        resolved_id="user:1",
        route_json=None,
        metadata_json=None,
        created_at=1,
    )
    nb.insert(
        name="acme.network",
        resolved_id="user:1",
        route_json="{}",
        metadata_json=None,
        created_at=2,
    )
    conn.commit()
    rows = nb.list_by_resolved_id("user:1")
    assert len(rows) == 2
    assert [r["name"] for r in rows] == ["acme.network", "alice@acme.network"]


def test_name_binding_roundtrip(conn: sqlite3.Connection) -> None:
    nb = NameBindingsRepository(conn)
    nb.insert(
        name="alice",
        resolved_id="user:1",
        route_json=None,
        metadata_json=None,
        created_at=3,
    )
    conn.commit()
    row = nb.get_by_name("alice")
    assert row is not None
    assert row["resolved_id"] == "user:1"


def test_message_dedup_roundtrip_and_delete(conn: sqlite3.Connection) -> None:
    d = MessageDedupRepository(conn)
    fp = b"\xcc" * 32
    d.insert(
        message_id="mid-1",
        request_fingerprint=fp,
        result_summary='{"status":"success"}',
        first_seen_at=1_000,
    )
    conn.commit()
    row = d.get_by_message_id("mid-1")
    assert row is not None
    assert row["request_fingerprint"] == fp
    n = d.delete_older_than(2_000)
    assert n == 1
    conn.commit()
    assert d.get_by_message_id("mid-1") is None


def test_message_dedup_update_result_summary(conn: sqlite3.Connection) -> None:
    d = MessageDedupRepository(conn)
    fp = b"\xdd" * 32
    d.insert(
        message_id="mid-update",
        request_fingerprint=fp,
        result_summary="pending",
        first_seen_at=1_000,
    )
    conn.commit()
    full = '{"status":"success","code":"ok","detail":"done"}'
    n = d.update_result_summary("mid-update", full)
    assert n == 1
    conn.commit()
    row = d.get_by_message_id("mid-update")
    assert row is not None
    assert row["result_summary"] == full
    assert d.update_result_summary("missing-id", full) == 0


def test_open_database_file(tmp_path) -> None:
    path = tmp_path / "t.db"
    c = open_database(path)
    try:
        apply_migrations(c)
        assert path.exists()
    finally:
        c.close()


def test_dial_route_entry_table_exists_after_migration(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        """
        SELECT 1 AS ok FROM sqlite_master
        WHERE type = 'table' AND name = 'dial_route_entry'
        """,
    ).fetchone()
    assert row is not None


def test_dial_route_entry_list_by_scope_orders_priority_then_id(
    conn: sqlite3.Connection,
) -> None:
    repo = DialRouteEntryRepository(conn)
    repo.upsert_merge(
        scope="modulr.core",
        route_type="ip",
        route="10.0.0.1:1",
        priority=10,
        endpoint_signing_public_key_hex=None,
        now=1_000,
    )
    repo.upsert_merge(
        scope="modulr.core",
        route_type="ip",
        route="10.0.0.2:2",
        priority=5,
        endpoint_signing_public_key_hex=None,
        now=1_000,
    )
    repo.upsert_merge(
        scope="modulr.core",
        route_type="ip",
        route="10.0.0.3:3",
        priority=5,
        endpoint_signing_public_key_hex=None,
        now=1_001,
    )
    conn.commit()
    rows = repo.list_by_scope("modulr.core")
    assert [r["route"] for r in rows] == ["10.0.0.2:2", "10.0.0.3:3", "10.0.0.1:1"]


def test_dial_route_entry_upsert_preserves_created_at(conn: sqlite3.Connection) -> None:
    repo = DialRouteEntryRepository(conn)
    repo.upsert_merge(
        scope="modulr.storage",
        route_type="ip",
        route="203.0.113.1:443",
        priority=0,
        endpoint_signing_public_key_hex=None,
        now=100,
    )
    conn.commit()
    repo.upsert_merge(
        scope="modulr.storage",
        route_type="ip",
        route="203.0.113.1:443",
        priority=99,
        endpoint_signing_public_key_hex="a" * 64,
        now=200,
    )
    conn.commit()
    rows = repo.list_by_scope("modulr.storage")
    assert len(rows) == 1
    assert rows[0]["created_at"] == 100
    assert rows[0]["updated_at"] == 200
    assert rows[0]["priority"] == 99
    assert rows[0]["endpoint_signing_public_key_hex"] == "a" * 64


def test_dial_route_entry_duplicate_plain_insert_raises(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        INSERT INTO dial_route_entry (
            scope, route_type, route, priority,
            endpoint_signing_public_key_hex, created_at, updated_at
        ) VALUES ('s', 'ip', 'h:1', 0, NULL, 1, 1)
        """,
    )
    conn.commit()
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            """
            INSERT INTO dial_route_entry (
                scope, route_type, route, priority,
                endpoint_signing_public_key_hex, created_at, updated_at
            ) VALUES ('s', 'ip', 'h:1', 1, NULL, 2, 2)
            """,
        )
        conn.commit()


def test_dial_route_entry_replace_all_for_scope(conn: sqlite3.Connection) -> None:
    repo = DialRouteEntryRepository(conn)
    repo.upsert_merge(
        scope="modulr.core",
        route_type="ip",
        route="old:1",
        priority=0,
        endpoint_signing_public_key_hex=None,
        now=1,
    )
    repo.upsert_merge(
        scope="modulr.core",
        route_type="ip",
        route="old:2",
        priority=1,
        endpoint_signing_public_key_hex=None,
        now=1,
    )
    conn.commit()
    repo.replace_all_for_scope(
        scope="modulr.core",
        entries=[
            ("dns", "core.example", 0, None),
            ("ip", "198.51.100.1:8443", 1, None),
        ],
        now=50,
    )
    conn.commit()
    rows = repo.list_by_scope("modulr.core")
    assert len(rows) == 2
    assert [r["route_type"] for r in rows] == ["dns", "ip"]
    assert rows[0]["created_at"] == 50
    assert rows[1]["created_at"] == 50


def test_dial_route_entry_delete_by_scope_and_dial(conn: sqlite3.Connection) -> None:
    repo = DialRouteEntryRepository(conn)
    repo.upsert_merge(
        scope="modulr.core",
        route_type="ip",
        route="10.0.0.1:8000",
        priority=0,
        endpoint_signing_public_key_hex=None,
        now=1,
    )
    conn.commit()
    assert (
        repo.delete_by_scope_and_dial(
            scope="modulr.core",
            route_type="ip",
            route="10.0.0.1:8000",
        )
        is True
    )
    assert (
        repo.delete_by_scope_and_dial(
            scope="modulr.core",
            route_type="ip",
            route="10.0.0.1:8000",
        )
        is False
    )
    conn.commit()
    assert repo.list_by_scope("modulr.core") == []


def test_duplicate_migration_version_raises(tmp_path, monkeypatch) -> None:
    (tmp_path / "001_first.sql").write_text("SELECT 1;", encoding="utf-8")
    (tmp_path / "001_second.sql").write_text("SELECT 1;", encoding="utf-8")
    monkeypatch.setattr(migrate_mod, "migrations_dir", lambda: tmp_path)
    c = connect_memory()
    with pytest.raises(
        DuplicateMigrationVersionError,
        match="duplicate migration version 1",
    ):
        apply_migrations(c)

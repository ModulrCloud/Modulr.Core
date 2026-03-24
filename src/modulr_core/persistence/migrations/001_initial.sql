-- Modulr.Core MVP initial schema (see plan/sqlite-schema.md).
-- ``schema_migrations`` is created by the migration runner before applying files.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS modules (
    module_name TEXT PRIMARY KEY,
    module_version TEXT NOT NULL,
    route_json TEXT NOT NULL,
    capabilities_json TEXT,
    metadata_json TEXT,
    signing_public_key BLOB NOT NULL,
    registered_by_sender_id TEXT NOT NULL,
    registered_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS name_bindings (
    name TEXT PRIMARY KEY,
    resolved_id TEXT NOT NULL,
    route_json TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS heartbeat_state (
    module_name TEXT PRIMARY KEY,
    module_version TEXT NOT NULL,
    status TEXT NOT NULL,
    route_json TEXT,
    metrics_json TEXT,
    last_seen_at INTEGER NOT NULL,
    FOREIGN KEY (module_name) REFERENCES modules (module_name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_dedup (
    message_id TEXT PRIMARY KEY,
    request_fingerprint BLOB NOT NULL,
    result_summary TEXT NOT NULL,
    first_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_message_dedup_first_seen ON message_dedup (first_seen_at);

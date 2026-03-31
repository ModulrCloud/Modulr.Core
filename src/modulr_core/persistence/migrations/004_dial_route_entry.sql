-- Multiple ordered dial endpoints per scope (``modulr.core`` or registered module name).
-- See plan/dial_routes_multi_entry.md. Handlers wire this in later stages.
CREATE TABLE IF NOT EXISTS dial_route_entry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    route_type TEXT NOT NULL,
    route TEXT NOT NULL,
    priority INTEGER NOT NULL,
    endpoint_signing_public_key_hex TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (scope, route_type, route)
);

CREATE INDEX IF NOT EXISTS idx_dial_route_entry_scope_priority
    ON dial_route_entry (scope, priority, id);

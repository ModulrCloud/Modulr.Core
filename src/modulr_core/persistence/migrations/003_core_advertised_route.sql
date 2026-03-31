-- Single-row table: advertised dial route for built-in modulr.core (not in ``modules``).
CREATE TABLE IF NOT EXISTS core_advertised_route (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    route_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

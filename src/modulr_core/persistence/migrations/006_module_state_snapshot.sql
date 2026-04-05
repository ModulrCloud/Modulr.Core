-- Latest lifecycle snapshot per registered module (``report_module_state`` / ``get_module_state``).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS module_state_snapshot (
    module_name TEXT PRIMARY KEY,
    state_phase TEXT NOT NULL,
    detail TEXT,
    reported_at INTEGER NOT NULL,
    FOREIGN KEY (module_name) REFERENCES modules (module_name) ON DELETE CASCADE
);

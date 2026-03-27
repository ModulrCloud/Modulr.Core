-- Index for reverse_resolve_name (lookup by identity).
PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS idx_name_bindings_resolved_id ON name_bindings (resolved_id);

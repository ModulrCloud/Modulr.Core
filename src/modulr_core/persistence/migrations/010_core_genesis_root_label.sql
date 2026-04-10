-- Root org single-label from wizard completion (used for guarded reset).
PRAGMA foreign_keys = ON;

ALTER TABLE core_genesis ADD COLUMN genesis_root_organization_label TEXT;

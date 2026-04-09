-- Optional bootstrap operator display name (wizard-collected; not a wire handle).
PRAGMA foreign_keys = ON;

ALTER TABLE core_genesis ADD COLUMN bootstrap_operator_display_name TEXT;

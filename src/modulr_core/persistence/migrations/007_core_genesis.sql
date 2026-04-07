-- Singleton genesis / bootstrap trust record for this Core instance.
-- Stores whether first-boot wizard finished and the proven Ed25519 signing pubkey
-- used to anchor apex policy (e.g. modulr.* namespace ownership). Enforcement of
-- subdomain rules uses this row in later stages; this migration only persists state.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS core_genesis (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    genesis_complete INTEGER NOT NULL DEFAULT 0 CHECK (genesis_complete IN (0, 1)),
    bootstrap_signing_pubkey_hex TEXT,
    modulr_apex_domain TEXT,
    updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO core_genesis (singleton, genesis_complete, updated_at)
VALUES (1, 0, 0);

-- Stable Core instance id (UUID) for binding challenges to this deployment.
-- genesis_challenge: one-shot Ed25519 proof records (anti-replay, TTL).
PRAGMA foreign_keys = ON;

ALTER TABLE core_genesis ADD COLUMN instance_id TEXT;

CREATE TABLE IF NOT EXISTS genesis_challenge (
    challenge_id TEXT PRIMARY KEY,
    subject_signing_pubkey_hex TEXT NOT NULL,
    body TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_genesis_challenge_expires ON genesis_challenge (expires_at);

-- Public user bio / description (centralized; optional per user handle or pubkey).
PRAGMA foreign_keys = ON;

ALTER TABLE entity_profile_branding ADD COLUMN description TEXT;

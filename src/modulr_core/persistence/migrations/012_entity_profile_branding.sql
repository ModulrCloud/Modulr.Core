-- Per-entity branding (org SVG logo, user profile image) for wire get/set.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS entity_profile_branding (
    entity_kind TEXT NOT NULL CHECK (entity_kind IN ('org', 'user')),
    entity_lookup TEXT NOT NULL,
    logo_svg TEXT,
    profile_image BLOB,
    profile_image_mime TEXT,
    signing_public_key_hex TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (entity_kind, entity_lookup)
);

CREATE INDEX IF NOT EXISTS idx_entity_profile_branding_signing_pk
ON entity_profile_branding (entity_kind, signing_public_key_hex);

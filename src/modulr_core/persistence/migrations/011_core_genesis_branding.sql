-- Root org logo (SVG markup) and bootstrap operator profile image (binary + MIME).
PRAGMA foreign_keys = ON;

ALTER TABLE core_genesis ADD COLUMN genesis_root_org_logo_svg TEXT;
ALTER TABLE core_genesis ADD COLUMN bootstrap_operator_profile_image BLOB;
ALTER TABLE core_genesis ADD COLUMN bootstrap_operator_profile_image_mime TEXT;

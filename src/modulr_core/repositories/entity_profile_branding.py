"""Persist per-entity org logos (SVG) and user profile images (raster + MIME)."""

from __future__ import annotations

import sqlite3
from typing import Any, Literal

EntityKind = Literal["org", "user"]


class EntityProfileBrandingRepository:
    """CRUD for ``entity_profile_branding`` (migration ``012``)."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, *, entity_kind: EntityKind, entity_lookup: str) -> dict[str, Any] | None:
        cur = self._conn.execute(
            """
            SELECT entity_kind, entity_lookup, logo_svg, profile_image,
                   profile_image_mime, signing_public_key_hex, updated_at
            FROM entity_profile_branding
            WHERE entity_kind = ? AND entity_lookup = ?
            """,
            (entity_kind, entity_lookup),
        )
        row = cur.fetchone()
        return dict(row) if row else None

    def upsert_org(
        self,
        *,
        entity_lookup: str,
        logo_svg: str | None,
        signing_public_key_hex: str | None,
        updated_at: int,
    ) -> None:
        self._conn.execute(
            """
            INSERT INTO entity_profile_branding (
                entity_kind, entity_lookup, logo_svg, profile_image,
                profile_image_mime, signing_public_key_hex, updated_at
            ) VALUES ('org', ?, ?, NULL, NULL, ?, ?)
            ON CONFLICT(entity_kind, entity_lookup) DO UPDATE SET
                logo_svg = excluded.logo_svg,
                signing_public_key_hex = excluded.signing_public_key_hex,
                updated_at = excluded.updated_at
            """,
            (entity_lookup, logo_svg, signing_public_key_hex, updated_at),
        )

    def upsert_user(
        self,
        *,
        entity_lookup: str,
        profile_image: bytes | None,
        profile_image_mime: str | None,
        signing_public_key_hex: str | None,
        updated_at: int,
    ) -> None:
        self._conn.execute(
            """
            INSERT INTO entity_profile_branding (
                entity_kind, entity_lookup, logo_svg, profile_image,
                profile_image_mime, signing_public_key_hex, updated_at
            ) VALUES ('user', ?, NULL, ?, ?, ?, ?)
            ON CONFLICT(entity_kind, entity_lookup) DO UPDATE SET
                profile_image = excluded.profile_image,
                profile_image_mime = excluded.profile_image_mime,
                signing_public_key_hex = excluded.signing_public_key_hex,
                updated_at = excluded.updated_at
            """,
            (entity_lookup, profile_image, profile_image_mime, signing_public_key_hex, updated_at),
        )

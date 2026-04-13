"""Singleton ``core_genesis`` row: wizard completion + bootstrap signing pubkey."""

from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from modulr_core.errors.exceptions import WireValidationError
from modulr_core.validation.hex_codec import InvalidHexEncoding, decode_hex_fixed
from modulr_core.validation.names import validate_modulr_org_domain

_MODULR_APEX_DOMAIN_MAX_LEN = 253

# Branding size caps (aligned with genesis completion validators / frontend).
_ROOT_ORG_LOGO_SVG_MAX_BYTES = 512 * 1024
_OPERATOR_PROFILE_IMAGE_MAX_BYTES = 256 * 1024
_ALLOWED_PROFILE_IMAGE_MIMES = frozenset(
    {"image/png", "image/jpeg", "image/webp", "image/gif"},
)


@dataclass(frozen=True)
class CoreGenesisSnapshot:
    """Read model for :class:`CoreGenesisRepository`."""

    genesis_complete: bool
    bootstrap_signing_pubkey_hex: str | None
    bootstrap_operator_display_name: str | None
    genesis_root_organization_label: str | None
    genesis_root_org_logo_svg: str | None
    bootstrap_operator_profile_image: bytes | None
    bootstrap_operator_profile_image_mime: str | None
    modulr_apex_domain: str | None
    instance_id: str | None
    updated_at: int


def _validate_bootstrap_pubkey_hex(pub_hex: str) -> None:
    try:
        raw = decode_hex_fixed(pub_hex, byte_length=32)
    except InvalidHexEncoding as e:
        raise ValueError(str(e)) from e
    try:
        Ed25519PublicKey.from_public_bytes(raw)
    except ValueError as e:
        raise ValueError(f"invalid Ed25519 public key: {e}") from e


def _validate_apex_domain(domain: str) -> str:
    """Enforce dotted DNS-style apex (``validate_modulr_org_domain``), max 253 chars."""
    d = domain.strip()
    if not d:
        raise ValueError("modulr_apex_domain must be non-empty when set")
    if len(d) > _MODULR_APEX_DOMAIN_MAX_LEN:
        mx = _MODULR_APEX_DOMAIN_MAX_LEN
        raise ValueError(f"modulr_apex_domain must be at most {mx} characters")
    try:
        return validate_modulr_org_domain(d)
    except WireValidationError as e:
        raise ValueError(
            "modulr_apex_domain must be a dotted DNS-style domain "
            "(same label rules as register_org; e.g. modulr.network)",
        ) from e


class CoreGenesisRepository:
    """Read/update the single ``core_genesis`` row.

    Migration ``007`` seeds the row; ``008`` adds ``instance_id``; ``009`` adds
    ``bootstrap_operator_display_name``; ``010`` adds
    ``genesis_root_organization_label``; ``011`` adds root org SVG logo and
    operator profile image blob + MIME.
    """

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self) -> CoreGenesisSnapshot:
        cur = self._conn.execute(
            """
            SELECT genesis_complete, bootstrap_signing_pubkey_hex,
                   bootstrap_operator_display_name,
                   genesis_root_organization_label,
                   genesis_root_org_logo_svg,
                   bootstrap_operator_profile_image,
                   bootstrap_operator_profile_image_mime,
                   modulr_apex_domain, instance_id, updated_at
            FROM core_genesis
            WHERE singleton = 1
            """,
        )
        row = cur.fetchone()
        if row is None:
            raise RuntimeError("core_genesis singleton missing; run apply_migrations")
        complete = int(row["genesis_complete"]) == 1
        pk = row["bootstrap_signing_pubkey_hex"]
        pk_s = str(pk) if pk is not None else None
        disp = row["bootstrap_operator_display_name"]
        disp_s = str(disp).strip() if disp is not None and str(disp).strip() else None
        root_lbl = row["genesis_root_organization_label"]
        root_s = (
            str(root_lbl).strip().lower()
            if root_lbl is not None and str(root_lbl).strip()
            else None
        )
        logo_svg = row["genesis_root_org_logo_svg"]
        logo_svg_s = (
            str(logo_svg)
            if logo_svg is not None and str(logo_svg).strip()
            else None
        )
        prof_blob = row["bootstrap_operator_profile_image"]
        prof_bytes = bytes(prof_blob) if prof_blob is not None else None
        prof_mime = row["bootstrap_operator_profile_image_mime"]
        prof_mime_s = (
            str(prof_mime).strip()
            if prof_mime is not None and str(prof_mime).strip()
            else None
        )
        apex = row["modulr_apex_domain"]
        apex_s = str(apex).strip() if apex is not None and str(apex).strip() else None
        iid = row["instance_id"]
        iid_s = str(iid).strip() if iid is not None and str(iid).strip() else None
        return CoreGenesisSnapshot(
            genesis_complete=complete,
            bootstrap_signing_pubkey_hex=pk_s,
            bootstrap_operator_display_name=disp_s,
            genesis_root_organization_label=root_s,
            genesis_root_org_logo_svg=logo_svg_s,
            bootstrap_operator_profile_image=prof_bytes,
            bootstrap_operator_profile_image_mime=prof_mime_s,
            modulr_apex_domain=apex_s,
            instance_id=iid_s,
            updated_at=int(row["updated_at"]),
        )

    def touch(self, *, updated_at: int) -> None:
        """Bump ``updated_at`` on the singleton row (activity / wizard progress)."""
        self._conn.execute(
            """
            UPDATE core_genesis SET updated_at = ? WHERE singleton = 1
            """,
            (updated_at,),
        )

    def get_or_create_instance_id(self, *, updated_at: int) -> str:
        """Return stable Core ``instance_id`` (UUID); allocate once on first use."""
        cur = self._conn.execute(
            "SELECT instance_id FROM core_genesis WHERE singleton = 1",
        )
        row = cur.fetchone()
        if row is None:
            raise RuntimeError("core_genesis singleton missing; run apply_migrations")
        existing = row["instance_id"]
        if existing is not None and str(existing).strip():
            return str(existing).strip()
        new_id = str(uuid.uuid4())
        self._conn.execute(
            """
            UPDATE core_genesis
            SET instance_id = ?, updated_at = ?
            WHERE singleton = 1
            """,
            (new_id, updated_at),
        )
        return new_id

    def set_genesis_complete(self, *, complete: bool, updated_at: int) -> None:
        self._conn.execute(
            """
            UPDATE core_genesis
            SET genesis_complete = ?, updated_at = ?
            WHERE singleton = 1
            """,
            (1 if complete else 0, updated_at),
        )

    def set_bootstrap_operator_display_name(
        self,
        *,
        display_name: str | None,
        updated_at: int,
    ) -> None:
        """Set optional wizard display name for the bootstrap operator (UTF-8 text)."""
        if display_name is not None and len(display_name) > 256:
            raise ValueError(
                "bootstrap_operator_display_name must be at most 256 characters",
            )
        self._conn.execute(
            """
            UPDATE core_genesis
            SET bootstrap_operator_display_name = ?, updated_at = ?
            WHERE singleton = 1
            """,
            (display_name, updated_at),
        )

    def set_genesis_root_organization_label(
        self,
        *,
        label: str | None,
        updated_at: int,
    ) -> None:
        """Persist the wizard root org single-label (migration ``010``)."""
        if label is not None and len(label) > 63:
            raise ValueError(
                "genesis_root_organization_label must be at most 63 characters",
            )
        self._conn.execute(
            """
            UPDATE core_genesis
            SET genesis_root_organization_label = ?, updated_at = ?
            WHERE singleton = 1
            """,
            (label, updated_at),
        )

    def set_genesis_root_org_logo_svg(
        self,
        *,
        svg_markup: str | None,
        updated_at: int,
    ) -> None:
        """Persist root organization logo as SVG source text (migration ``011``)."""
        if svg_markup is not None:
            u8 = len(svg_markup.encode("utf-8"))
            if u8 > _ROOT_ORG_LOGO_SVG_MAX_BYTES:
                mx = _ROOT_ORG_LOGO_SVG_MAX_BYTES
                raise ValueError(
                    f"genesis_root_org_logo_svg must be at most {mx} bytes (UTF-8)",
                )
        self._conn.execute(
            """
            UPDATE core_genesis
            SET genesis_root_org_logo_svg = ?, updated_at = ?
            WHERE singleton = 1
            """,
            (svg_markup, updated_at),
        )

    def set_bootstrap_operator_profile_image(
        self,
        *,
        image: bytes | None,
        mime: str | None,
        updated_at: int,
    ) -> None:
        """Persist bootstrap operator profile raster bytes and MIME type."""
        if (image is None) != (mime is None):
            raise ValueError(
                "bootstrap_operator_profile_image and mime must both be set "
                "or both null",
            )
        if image is not None and len(image) > _OPERATOR_PROFILE_IMAGE_MAX_BYTES:
            mx = _OPERATOR_PROFILE_IMAGE_MAX_BYTES
            raise ValueError(
                f"bootstrap_operator_profile_image must be at most {mx} bytes",
            )
        if mime is not None and mime not in _ALLOWED_PROFILE_IMAGE_MIMES:
            raise ValueError(
                "bootstrap_operator_profile_image_mime must be one of: "
                + ", ".join(sorted(_ALLOWED_PROFILE_IMAGE_MIMES)),
            )
        self._conn.execute(
            """
            UPDATE core_genesis
            SET bootstrap_operator_profile_image = ?,
                bootstrap_operator_profile_image_mime = ?,
                updated_at = ?
            WHERE singleton = 1
            """,
            (image, mime, updated_at),
        )

    def clear_genesis_wizard_state(self, *, updated_at: int) -> None:
        """Reset wizard columns so the first-boot flow can run again.

        Clears completion flags and operator/org fields; keeps ``instance_id``.
        """
        self._conn.execute(
            """
            UPDATE core_genesis SET
                genesis_complete = 0,
                bootstrap_signing_pubkey_hex = NULL,
                bootstrap_operator_display_name = NULL,
                genesis_root_organization_label = NULL,
                genesis_root_org_logo_svg = NULL,
                bootstrap_operator_profile_image = NULL,
                bootstrap_operator_profile_image_mime = NULL,
                modulr_apex_domain = NULL,
                updated_at = ?
            WHERE singleton = 1
            """,
            (updated_at,),
        )

    def set_bootstrap_signing_pubkey_hex(
        self,
        *,
        pubkey_hex: str | None,
        updated_at: int,
    ) -> None:
        if pubkey_hex is not None:
            _validate_bootstrap_pubkey_hex(pubkey_hex)
        self._conn.execute(
            """
            UPDATE core_genesis
            SET bootstrap_signing_pubkey_hex = ?, updated_at = ?
            WHERE singleton = 1
            """,
            (pubkey_hex, updated_at),
        )

    def set_modulr_apex_domain(
        self,
        *,
        apex_domain: str | None,
        updated_at: int,
    ) -> None:
        if apex_domain is not None:
            apex_domain = _validate_apex_domain(apex_domain)
        self._conn.execute(
            """
            UPDATE core_genesis
            SET modulr_apex_domain = ?, updated_at = ?
            WHERE singleton = 1
            """,
            (apex_domain, updated_at),
        )

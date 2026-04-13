"""Finalize genesis: bind root org name, operator + org keys, ``genesis_complete``."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from modulr_core.repositories.core_genesis import CoreGenesisRepository
from modulr_core.repositories.genesis_challenge import GenesisChallengeRepository
from modulr_core.repositories.name_bindings import NameBindingsRepository
from modulr_core.validation.hex_codec import InvalidHexEncoding, decode_hex_fixed

# Max seconds after challenge consume during which ``complete`` is allowed.
GENESIS_COMPLETION_WINDOW_SECONDS = 900

# Branding limits (keep in sync with ``CoreGenesisRepository`` and the UI).
_ROOT_ORG_LOGO_SVG_MAX_UTF8_BYTES = 512 * 1024
_OPERATOR_PROFILE_IMAGE_MAX_BYTES = 256 * 1024
_ALLOWED_PROFILE_IMAGE_MIMES = frozenset(
    {"image/png", "image/jpeg", "image/webp", "image/gif"},
)


class GenesisCompletionError(Exception):
    """Invalid completion request or inconsistent genesis state."""


def validate_genesis_root_organization_label(raw: str) -> str:
    """
    Normalize and validate a single-segment root organization name for genesis.

    One segment only (no ``.``), up to 63 Unicode code points — allows letters,
    digits, emoji, spaces, etc., so operators can use a friendly label. Still not
    the same rule as dotted ``register_org`` domains.

    Args:
        raw: Operator-supplied root organization label.

    Returns:
        Lowercased string (Unicode ``.lower()`` for letters; emoji unchanged).

    Raises:
        GenesisCompletionError: If the label is empty, longer than 63 Unicode code
            points after lowercasing, contains ``.``, or ASCII control characters
            (U+0000–U+001F or U+007F). Length is enforced **after** ``.lower()`` so
            case folding cannot expand the string past the limit (e.g. Turkish
            ``İ`` → ``i`` + combining dot).
    """
    s = raw.strip()
    if not s:
        raise GenesisCompletionError("root_organization_name must be non-empty")
    if "." in s:
        raise GenesisCompletionError(
            "root_organization_name must be a single segment with no dots "
            "(not a domain.subdomain style name)",
        )
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in s):
        raise GenesisCompletionError(
            "root_organization_name must not contain control characters",
        )
    normalized = s.lower()
    if len(normalized) > 63:
        raise GenesisCompletionError(
            "root_organization_name must be at most 63 characters",
        )
    return normalized


def _normalize_ed25519_pubkey_hex(raw: str) -> str:
    s = raw.strip().lower()
    try:
        decode_hex_fixed(s, byte_length=32)
    except InvalidHexEncoding as e:
        raise GenesisCompletionError(
            "root_organization_signing_public_key_hex must be a valid "
            f"lowercase Ed25519 public key (64 hex chars): {e}",
        ) from e
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(s))
    except ValueError as e:
        raise GenesisCompletionError(
            "invalid Ed25519 public key for organization",
        ) from e
    return s


def _validate_operator_display_name(raw: str | None) -> str | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise GenesisCompletionError("operator_display_name must be a string or null")
    s = raw.strip()
    if not s:
        return None
    if len(s) > 256:
        raise GenesisCompletionError(
            "operator_display_name must be at most 256 characters",
        )
    return s


def _validate_root_org_logo_svg_for_completion(raw: str | None) -> str | None:
    if raw is None:
        return None
    data = raw.encode("utf-8")
    if len(data) > _ROOT_ORG_LOGO_SVG_MAX_UTF8_BYTES:
        raise GenesisCompletionError(
            f"root_organization_logo_svg must be at most "
            f"{_ROOT_ORG_LOGO_SVG_MAX_UTF8_BYTES} UTF-8 bytes",
        )
    head = data[:8192].lower()
    if b"<svg" not in head:
        raise GenesisCompletionError(
            "root_organization_logo_svg must be SVG markup containing an <svg> element",
        )
    return raw


def _validate_operator_profile_for_completion(
    image: bytes | None,
    mime: str | None,
) -> tuple[bytes | None, str | None]:
    if image is None and mime is None:
        return None, None
    if image is None or mime is None:
        raise GenesisCompletionError(
            "operator profile image and MIME type must both be set or both omitted",
        )
    if len(image) > _OPERATOR_PROFILE_IMAGE_MAX_BYTES:
        raise GenesisCompletionError(
            f"bootstrap operator profile image must be at most "
            f"{_OPERATOR_PROFILE_IMAGE_MAX_BYTES} bytes",
        )
    m = mime.strip().lower()
    if m not in _ALLOWED_PROFILE_IMAGE_MIMES:
        raise GenesisCompletionError(
            "bootstrap_operator_profile_image_mime must be one of: "
            + ", ".join(sorted(_ALLOWED_PROFILE_IMAGE_MIMES)),
        )
    return image, m


def _binding_matches_existing(
    row: dict[str, Any],
    *,
    resolved_id: str,
) -> bool:
    rj = row.get("route_json")
    mj = row.get("metadata_json")
    rj_n = None if rj in (None, "") else str(rj)
    mj_n = None if mj in (None, "") else str(mj)
    return str(row["resolved_id"]) == resolved_id and rj_n is None and mj_n is None


def complete_genesis(
    *,
    genesis_repo: CoreGenesisRepository,
    challenge_repo: GenesisChallengeRepository,
    name_repo: NameBindingsRepository,
    clock: Callable[[], int],
    challenge_id: str,
    subject_signing_pubkey_hex: str,
    root_organization_name: str,
    root_organization_signing_public_key_hex: str,
    operator_display_name: str | None,
    root_organization_logo_svg: str | None = None,
    operator_profile_image: bytes | None = None,
    operator_profile_image_mime: str | None = None,
) -> None:
    """
    Atomically complete the genesis wizard (caller commits).

    Requires a consumed challenge for ``subject_signing_pubkey_hex`` within
    :data:`GENESIS_COMPLETION_WINDOW_SECONDS` after consume. Binds the root
    org name to the organization signing public key (``resolved_id``), stores
    the bootstrap operator key, optional display name, and sets
    ``genesis_complete``.

    Args:
        genesis_repo: Singleton ``core_genesis`` row.
        challenge_repo: ``genesis_challenge`` rows.
        name_repo: ``name_bindings`` repository.
        clock: Unix seconds callable.
        challenge_id: 64-hex challenge id from verify step.
        subject_signing_pubkey_hex: Operator key (must match consumed
            challenge).
        root_organization_name: Single-segment root org name (e.g. ``modulr`` or
            ``modulr 🚀``); no dots; validated by
            :func:`validate_genesis_root_organization_label`.
        root_organization_signing_public_key_hex: Org Ed25519 public key hex;
            stored as ``name_bindings.resolved_id``.
        operator_display_name: Optional operator display string (e.g. ``Chris``).
        root_organization_logo_svg: Optional SVG source for the root org header logo.
        operator_profile_image: Optional raster bytes for the bootstrap operator
            profile picture.
        operator_profile_image_mime: MIME type for ``operator_profile_image``
            (e.g. ``image/png``); must be set when ``operator_profile_image`` is set.

    Raises:
        GenesisCompletionError: Validation or state errors.
    """
    snap = genesis_repo.get()
    if snap.genesis_complete:
        raise GenesisCompletionError("genesis already complete")

    cid = challenge_id.strip().lower()
    if len(cid) != 64 or any(c not in "0123456789abcdef" for c in cid):
        raise GenesisCompletionError("invalid challenge_id")

    row = challenge_repo.get_by_id(cid)
    if row is None:
        raise GenesisCompletionError("unknown challenge_id")
    if row.consumed_at is None:
        raise GenesisCompletionError(
            "challenge not verified; call POST /genesis/challenge/verify first",
        )

    subj = subject_signing_pubkey_hex.strip().lower()
    if subj != row.subject_signing_pubkey_hex:
        raise GenesisCompletionError(
            "subject_signing_pubkey_hex does not match the verified challenge",
        )

    now = int(clock())
    if now - int(row.consumed_at) > GENESIS_COMPLETION_WINDOW_SECONDS:
        raise GenesisCompletionError(
            "genesis completion window expired; verify the challenge again",
        )

    root_label = validate_genesis_root_organization_label(root_organization_name)
    org_resolved_id = _normalize_ed25519_pubkey_hex(
        root_organization_signing_public_key_hex,
    )
    display = _validate_operator_display_name(operator_display_name)
    logo_svg = _validate_root_org_logo_svg_for_completion(root_organization_logo_svg)
    prof_img, prof_mime = _validate_operator_profile_for_completion(
        operator_profile_image,
        operator_profile_image_mime,
    )

    existing = name_repo.get_by_name(root_label)
    if existing is not None:
        if not _binding_matches_existing(existing, resolved_id=org_resolved_id):
            raise GenesisCompletionError(
                "root organization name is already bound to different data",
            )
    else:
        name_repo.insert(
            name=root_label,
            resolved_id=org_resolved_id,
            route_json=None,
            metadata_json=None,
            created_at=now,
        )

    genesis_repo.set_genesis_root_organization_label(label=root_label, updated_at=now)
    genesis_repo.set_bootstrap_signing_pubkey_hex(pubkey_hex=subj, updated_at=now)
    genesis_repo.set_bootstrap_operator_display_name(
        display_name=display,
        updated_at=now,
    )
    genesis_repo.set_genesis_root_org_logo_svg(svg_markup=logo_svg, updated_at=now)
    genesis_repo.set_bootstrap_operator_profile_image(
        image=prof_img,
        mime=prof_mime,
        updated_at=now,
    )
    genesis_repo.set_genesis_complete(complete=True, updated_at=now)

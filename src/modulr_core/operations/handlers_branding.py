"""Wire handlers for org logo and user profile image (get/set by name or pubkey)."""

from __future__ import annotations

import base64
import binascii
import sqlite3
from typing import Any

from modulr_core.bootstrap_effective import (
    normalize_ed25519_public_key_hex,
    sender_is_effective_bootstrap,
)
from modulr_core.clock import EpochClock
from modulr_core.config.schema import Settings
from modulr_core.errors.codes import ErrorCode, SuccessCode
from modulr_core.errors.exceptions import WireValidationError
from modulr_core.genesis.completion import (
    GenesisCompletionError,
    validate_genesis_root_organization_label,
)
from modulr_core.http.envelope import success_response_envelope
from modulr_core.messages.types import ValidatedInbound
from modulr_core.operations.payload_util import optional_str
from modulr_core.repositories.core_genesis import CoreGenesisRepository
from modulr_core.repositories.entity_profile_branding import (
    EntityProfileBrandingRepository,
)
from modulr_core.repositories.name_bindings import NameBindingsRepository
from modulr_core.validation.hex_codec import InvalidHexEncoding, decode_hex_fixed
from modulr_core.validation.names import validate_modulr_org_domain

_ROOT_ORG_LOGO_SVG_MAX_UTF8_BYTES = 512 * 1024
_OPERATOR_PROFILE_IMAGE_MAX_BYTES = 256 * 1024
_ALLOWED_PROFILE_IMAGE_MIMES = frozenset(
    {"image/png", "image/jpeg", "image/webp", "image/gif"},
)


def _require_ed25519_pk(p: dict[str, Any], field: str) -> str:
    v = p.get(field)
    if not isinstance(v, str) or not v.strip():
        raise WireValidationError(
            f"payload.{field} must be a non-empty hex string",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    s = v.strip().lower()
    try:
        decode_hex_fixed(s, byte_length=32)
    except InvalidHexEncoding as e:
        raise WireValidationError(
            f"payload.{field} is not valid Ed25519 public key hex: {e}",
            code=ErrorCode.PUBLIC_KEY_INVALID,
        ) from e
    return s


def normalize_organization_key_wire(raw: str) -> str:
    """Normalize org label (single segment) or dotted org domain for lookups."""
    s = raw.strip()
    if not s:
        raise WireValidationError(
            "organization_key must be a non-empty string",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    if "." in s:
        return validate_modulr_org_domain(s).lower()
    try:
        return validate_genesis_root_organization_label(s)
    except GenesisCompletionError as e:
        raise WireValidationError(str(e), code=ErrorCode.PAYLOAD_INVALID) from e


def _org_lookup_k(name_norm: str) -> str:
    return f"k:{name_norm}"


def _org_lookup_p(pk_hex: str) -> str:
    return f"p:{normalize_ed25519_public_key_hex(pk_hex)}"


def _normalize_user_handle_wire(raw: str) -> str:
    s = raw.strip()
    if s.startswith("@"):
        s = s[1:].strip()
    if not s:
        raise WireValidationError(
            "user_handle must be a non-empty string",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    if len(s) > 256:
        raise WireValidationError(
            "user_handle must be at most 256 characters",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return s.lower()


def _user_lookup_h(handle_norm: str) -> str:
    return f"h:{handle_norm}"


def _user_lookup_p(pk_hex: str) -> str:
    return f"p:{normalize_ed25519_public_key_hex(pk_hex)}"


def _validate_logo_svg_wire(raw: str | None) -> str | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise WireValidationError(
            "payload.logo_svg must be a string or null",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    data = raw.encode("utf-8")
    if len(data) > _ROOT_ORG_LOGO_SVG_MAX_UTF8_BYTES:
        mx = _ROOT_ORG_LOGO_SVG_MAX_UTF8_BYTES
        raise WireValidationError(
            f"logo_svg must be at most {mx} UTF-8 bytes",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    if b"<svg" not in data[:8192].lower():
        raise WireValidationError(
            "logo_svg must be SVG markup containing an <svg> element",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return raw


def _decode_profile_image_base64(raw: str | None) -> tuple[bytes | None, str | None]:
    if raw is None:
        return None, None
    if not isinstance(raw, str):
        raise WireValidationError(
            "payload.profile_image_base64 must be a string or null",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    s = raw.strip()
    if not s:
        return None, None
    try:
        b = base64.b64decode(s, validate=True)
    except binascii.Error as e:
        raise WireValidationError(
            f"profile_image_base64 is not valid standard Base64: {e}",
            code=ErrorCode.PAYLOAD_INVALID,
        ) from e
    if len(b) > _OPERATOR_PROFILE_IMAGE_MAX_BYTES:
        mx = _OPERATOR_PROFILE_IMAGE_MAX_BYTES
        raise WireValidationError(
            f"decoded profile image must be at most {mx} bytes",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return b, None


def _validate_profile_mime(mime: str | None) -> str | None:
    if mime is None:
        return None
    if not isinstance(mime, str) or not mime.strip():
        raise WireValidationError(
            "payload.profile_image_mime must be a non-empty string when provided",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    m = mime.strip().lower()
    if m not in _ALLOWED_PROFILE_IMAGE_MIMES:
        raise WireValidationError(
            "profile_image_mime must be one of: "
            + ", ".join(sorted(_ALLOWED_PROFILE_IMAGE_MIMES)),
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return m


def _genesis_org_logo_snapshot(
    conn: sqlite3.Connection,
    *,
    norm_name: str | None,
    pk_hex: str | None,
) -> dict[str, Any] | None:
    """Return genesis root org logo payload when the identifier matches the root org."""
    g = CoreGenesisRepository(conn).get()
    if not g.genesis_complete or not g.genesis_root_organization_label:
        return None
    nb = NameBindingsRepository(conn).get_by_name(g.genesis_root_organization_label)
    if nb is None:
        return None
    resolved_pk = str(nb["resolved_id"]).strip().lower()
    if norm_name is not None:
        if norm_name != g.genesis_root_organization_label:
            return None
    elif pk_hex is not None:
        if normalize_ed25519_public_key_hex(pk_hex) != resolved_pk:
            return None
    else:
        return None
    logo = g.genesis_root_org_logo_svg
    return {
        "organization_key": g.genesis_root_organization_label,
        "organization_signing_public_key_hex": resolved_pk,
        "logo_svg": logo,
        "source": "genesis",
    }


def _resolve_organization_logo(
    conn: sqlite3.Connection,
    *,
    norm_name: str | None,
    pk_hex: str | None,
) -> dict[str, Any]:
    repo = EntityProfileBrandingRepository(conn)
    if norm_name is not None:
        row = repo.get(entity_kind="org", entity_lookup=_org_lookup_k(norm_name))
        if row is not None:
            logo = row.get("logo_svg")
            nb = NameBindingsRepository(conn).get_by_name(norm_name)
            rpk = (
                str(nb["resolved_id"]).lower()
                if nb
                else row.get("signing_public_key_hex")
            )
            return {
                "organization_key": norm_name,
                "organization_signing_public_key_hex": rpk,
                "logo_svg": logo,
                "source": "entity",
            }
    if pk_hex is not None:
        npk = normalize_ed25519_public_key_hex(pk_hex)
        row = repo.get(entity_kind="org", entity_lookup=_org_lookup_p(npk))
        if row is not None:
            return {
                "organization_key": None,
                "organization_signing_public_key_hex": npk,
                "logo_svg": row.get("logo_svg"),
                "source": "entity",
            }
        for binding in NameBindingsRepository(conn).list_by_resolved_id(npk):
            nm_key = normalize_organization_key_wire(str(binding["name"]))
            row2 = repo.get(entity_kind="org", entity_lookup=_org_lookup_k(nm_key))
            if row2 is not None:
                return {
                    "organization_key": nm_key,
                    "organization_signing_public_key_hex": npk,
                    "logo_svg": row2.get("logo_svg"),
                    "source": "entity",
                }

    snap = _genesis_org_logo_snapshot(conn, norm_name=norm_name, pk_hex=pk_hex)
    if snap:
        return snap

    raise WireValidationError(
        "no organization logo found for the given identifier",
        code=ErrorCode.IDENTITY_NOT_FOUND,
    )


def _genesis_user_profile_snapshot(
    conn: sqlite3.Connection,
    *,
    handle_norm: str | None,
    pk_hex: str | None,
) -> dict[str, Any] | None:
    """Return bootstrap operator profile from genesis when identifiers match."""
    g = CoreGenesisRepository(conn).get()
    if not g.genesis_complete or not g.bootstrap_signing_pubkey_hex:
        return None
    bpk = normalize_ed25519_public_key_hex(g.bootstrap_signing_pubkey_hex)
    if pk_hex is not None:
        if normalize_ed25519_public_key_hex(pk_hex) != bpk:
            return None
    elif handle_norm is not None:
        disp = g.bootstrap_operator_display_name
        if disp is None or disp.strip().lower() != handle_norm:
            return None
    else:
        return None
    img = g.bootstrap_operator_profile_image
    mime = g.bootstrap_operator_profile_image_mime
    b64 = base64.b64encode(bytes(img)).decode("ascii") if img else None
    disp = g.bootstrap_operator_display_name
    return {
        "user_handle": disp.strip().lower() if disp else None,
        "user_signing_public_key_hex": bpk,
        "profile_image_base64": b64,
        "profile_image_mime": str(mime) if mime else None,
        "source": "genesis",
    }


def _resolve_user_profile(
    conn: sqlite3.Connection,
    *,
    handle_norm: str | None,
    pk_hex: str | None,
) -> dict[str, Any]:
    repo = EntityProfileBrandingRepository(conn)
    if handle_norm is not None:
        row = repo.get(entity_kind="user", entity_lookup=_user_lookup_h(handle_norm))
        if row is not None:
            raw = row["profile_image"]
            b = bytes(raw) if raw is not None else None
            mime = row.get("profile_image_mime")
            mimes = str(mime) if mime else None
            b64 = base64.b64encode(b).decode("ascii") if b else None
            return {
                "user_handle": handle_norm,
                "user_signing_public_key_hex": row.get("signing_public_key_hex"),
                "profile_image_base64": b64,
                "profile_image_mime": mimes,
                "source": "entity",
            }
    if pk_hex is not None:
        npk = normalize_ed25519_public_key_hex(pk_hex)
        row = repo.get(entity_kind="user", entity_lookup=_user_lookup_p(npk))
        if row is not None:
            raw = row["profile_image"]
            b = bytes(raw) if raw is not None else None
            mime = row.get("profile_image_mime")
            mimes = str(mime) if mime else None
            b64 = base64.b64encode(b).decode("ascii") if b else None
            return {
                "user_handle": None,
                "user_signing_public_key_hex": npk,
                "profile_image_base64": b64,
                "profile_image_mime": mimes,
                "source": "entity",
            }

    gsnap = _genesis_user_profile_snapshot(
        conn,
        handle_norm=handle_norm,
        pk_hex=pk_hex,
    )
    if gsnap is not None:
        return gsnap

    raise WireValidationError(
        "no user profile image found for the given identifier",
        code=ErrorCode.IDENTITY_NOT_FOUND,
    )


def require_str_branding(p: dict[str, Any], key: str) -> str:
    v = p.get(key)
    if not isinstance(v, str) or not v.strip():
        raise WireValidationError(
            f"payload.{key} must be a non-empty string",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    return v.strip()


def handle_get_organization_logo(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    del settings
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    has_key = (
        p.get("organization_key") is not None
        and str(p.get("organization_key", "")).strip()
    )
    has_pk = (
        p.get("organization_signing_public_key_hex") is not None
        and str(
            p.get("organization_signing_public_key_hex", ""),
        ).strip()
    )
    if has_key == has_pk:
        raise WireValidationError(
            "provide exactly one of organization_key or "
            "organization_signing_public_key_hex",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    norm_name: str | None = None
    pk: str | None = None
    if has_key:
        norm_name = normalize_organization_key_wire(
            require_str_branding(p, "organization_key")
        )
    else:
        pk = _require_ed25519_pk(p, "organization_signing_public_key_hex")

    body = _resolve_organization_logo(conn, norm_name=norm_name, pk_hex=pk)
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="get_organization_logo_response",
        success_code=SuccessCode.ORGANIZATION_LOGO_RETURNED,
        detail="Organization logo (SVG markup).",
        payload=body,
        clock=clock,
    )


def handle_get_user_profile_image(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    del settings
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    has_h = p.get("user_handle") is not None and str(p.get("user_handle", "")).strip()
    has_pk = (
        p.get("user_signing_public_key_hex") is not None
        and str(
            p.get("user_signing_public_key_hex", ""),
        ).strip()
    )
    if has_h == has_pk:
        raise WireValidationError(
            "provide exactly one of user_handle or user_signing_public_key_hex",
            code=ErrorCode.PAYLOAD_INVALID,
        )
    handle_norm: str | None = None
    pk: str | None = None
    if has_h:
        handle_norm = _normalize_user_handle_wire(
            require_str_branding(p, "user_handle")
        )
    else:
        pk = _require_ed25519_pk(p, "user_signing_public_key_hex")

    body = _resolve_user_profile(conn, handle_norm=handle_norm, pk_hex=pk)
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="get_user_profile_image_response",
        success_code=SuccessCode.USER_PROFILE_IMAGE_RETURNED,
        detail="User profile image (base64 + MIME).",
        payload=body,
        clock=clock,
    )


def _is_genesis_root_org(
    conn: sqlite3.Connection,
    *,
    org_pk: str,
    norm_name: str | None,
) -> bool:
    g = CoreGenesisRepository(conn).get()
    if not g.genesis_complete or not g.genesis_root_organization_label:
        return False
    nb = NameBindingsRepository(conn).get_by_name(g.genesis_root_organization_label)
    if nb is None:
        return False
    if str(nb["resolved_id"]).strip().lower() != normalize_ed25519_public_key_hex(
        org_pk
    ):
        return False
    if norm_name is None:
        return True
    return norm_name == g.genesis_root_organization_label


def _is_genesis_bootstrap_user(conn: sqlite3.Connection, *, user_pk: str) -> bool:
    g = CoreGenesisRepository(conn).get()
    if not g.genesis_complete or not g.bootstrap_signing_pubkey_hex:
        return False
    return normalize_ed25519_public_key_hex(
        user_pk
    ) == normalize_ed25519_public_key_hex(g.bootstrap_signing_pubkey_hex)


def handle_set_organization_logo(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    org_pk = _require_ed25519_pk(p, "organization_signing_public_key_hex")
    logo_svg = _validate_logo_svg_wire(p.get("logo_svg"))
    opt_name = optional_str(p, "organization_key")
    norm_name: str | None = None
    if opt_name is not None and opt_name.strip():
        norm_name = normalize_organization_key_wire(opt_name)

    sender = env["sender_public_key"]
    if normalize_ed25519_public_key_hex(sender) != normalize_ed25519_public_key_hex(
        org_pk,
    ) and not sender_is_effective_bootstrap(sender, settings=settings, conn=conn):
        raise WireValidationError(
            "sender must match organization_signing_public_key_hex or be bootstrap",
            code=ErrorCode.UNAUTHORIZED,
        )

    if norm_name is not None:
        lookup = _org_lookup_k(norm_name)
    else:
        lookup = _org_lookup_p(org_pk)

    now = int(clock())
    repo = EntityProfileBrandingRepository(conn)
    repo.upsert_org(
        entity_lookup=lookup,
        logo_svg=logo_svg,
        signing_public_key_hex=normalize_ed25519_public_key_hex(org_pk),
        updated_at=now,
    )

    if _is_genesis_root_org(conn, org_pk=org_pk, norm_name=norm_name):
        CoreGenesisRepository(conn).set_genesis_root_org_logo_svg(
            svg_markup=logo_svg,
            updated_at=now,
        )

    out: dict[str, Any] = {
        "organization_key": norm_name,
        "organization_signing_public_key_hex": normalize_ed25519_public_key_hex(org_pk),
        "logo_svg_stored": logo_svg is not None,
    }
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="set_organization_logo_response",
        success_code=SuccessCode.ORGANIZATION_LOGO_UPDATED,
        detail="Organization logo updated.",
        payload=out,
        clock=clock,
    )


def handle_set_user_profile_image(
    validated: ValidatedInbound,
    *,
    settings: Settings,
    conn: sqlite3.Connection,
    clock: EpochClock,
) -> dict[str, Any]:
    env = validated.envelope
    p: dict[str, Any] = env["payload"]
    user_pk = _require_ed25519_pk(p, "user_signing_public_key_hex")
    img_bytes, _ = _decode_profile_image_base64(p.get("profile_image_base64"))
    mime = _validate_profile_mime(optional_str(p, "profile_image_mime"))
    opt_handle = optional_str(p, "user_handle")
    handle_norm: str | None = None
    if opt_handle is not None and opt_handle.strip():
        handle_norm = _normalize_user_handle_wire(opt_handle)

    if (img_bytes is None) != (mime is None):
        raise WireValidationError(
            "profile_image_base64 and profile_image_mime must both be set or both null",
            code=ErrorCode.PAYLOAD_INVALID,
        )

    sender = env["sender_public_key"]
    if normalize_ed25519_public_key_hex(sender) != normalize_ed25519_public_key_hex(
        user_pk,
    ) and not sender_is_effective_bootstrap(sender, settings=settings, conn=conn):
        raise WireValidationError(
            "sender must match user_signing_public_key_hex or be bootstrap",
            code=ErrorCode.UNAUTHORIZED,
        )

    now = int(clock())
    repo = EntityProfileBrandingRepository(conn)
    if handle_norm is not None:
        lookup = _user_lookup_h(handle_norm)
    else:
        lookup = _user_lookup_p(user_pk)

    repo.upsert_user(
        entity_lookup=lookup,
        profile_image=img_bytes,
        profile_image_mime=mime,
        signing_public_key_hex=normalize_ed25519_public_key_hex(user_pk),
        updated_at=now,
    )

    if _is_genesis_bootstrap_user(conn, user_pk=user_pk):
        CoreGenesisRepository(conn).set_bootstrap_operator_profile_image(
            image=img_bytes,
            mime=mime,
            updated_at=now,
        )

    out: dict[str, Any] = {
        "user_handle": handle_norm,
        "user_signing_public_key_hex": normalize_ed25519_public_key_hex(user_pk),
        "profile_image_stored": img_bytes is not None,
    }
    return success_response_envelope(
        request_message_id=env["message_id"],
        operation_response="set_user_profile_image_response",
        success_code=SuccessCode.USER_PROFILE_IMAGE_UPDATED,
        detail="User profile image updated.",
        payload=out,
        clock=clock,
    )

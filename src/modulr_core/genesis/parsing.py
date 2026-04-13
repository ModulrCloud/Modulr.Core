"""Parse genesis wizard JSON bodies (shared by HTTP handlers and CLI)."""

from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class GenesisCompleteParsed:
    """Fields for ``POST /genesis/complete`` after JSON parse (optional branding)."""

    challenge_id: str
    subject_signing_pubkey_hex: str
    root_organization_name: str
    root_organization_signing_public_key_hex: str
    operator_display_name: str | None
    root_organization_logo_svg: str | None
    operator_profile_image_bytes: bytes | None
    operator_profile_image_mime: str | None


def parse_genesis_challenge_issue_body(data: Any) -> str:
    """
    Extract ``subject_signing_pubkey_hex`` from a parsed JSON object.

    Raises:
        ValueError: If the shape is invalid or the field is missing/empty.
    """
    if not isinstance(data, dict):
        raise ValueError("request body must be a JSON object")
    raw = data.get("subject_signing_pubkey_hex")
    if not isinstance(raw, str):
        raise ValueError("subject_signing_pubkey_hex must be a string")
    pk = raw.strip()
    if not pk:
        raise ValueError("subject_signing_pubkey_hex must be non-empty")
    return pk


def parse_genesis_challenge_verify_body(data: Any) -> tuple[str, str]:
    """
    Extract ``challenge_id`` and ``signature_hex`` from a parsed JSON object.

    Raises:
        ValueError: If the shape is invalid or a field is missing/empty.
    """
    if not isinstance(data, dict):
        raise ValueError("request body must be a JSON object")
    cid_raw = data.get("challenge_id")
    sig_raw = data.get("signature_hex")
    if not isinstance(cid_raw, str) or not isinstance(sig_raw, str):
        raise ValueError("challenge_id and signature_hex must be strings")
    challenge_id = cid_raw.strip()
    signature_hex = sig_raw.strip()
    if not challenge_id or not signature_hex:
        raise ValueError("challenge_id and signature_hex must be non-empty")
    return challenge_id, signature_hex


def parse_genesis_complete_body(data: Any) -> GenesisCompleteParsed:
    """
    Extract genesis completion fields from a parsed JSON object.

    Optional branding:
    ``root_organization_logo_svg`` (string),
    ``bootstrap_operator_profile_image_base64`` (standard base64 string),
    ``bootstrap_operator_profile_image_mime`` (e.g. ``image/png``). Image fields
    must be sent together or omitted.

    Raises:
        ValueError: If required fields are missing or wrong types.
    """
    if not isinstance(data, dict):
        raise ValueError("request body must be a JSON object")
    cid = data.get("challenge_id")
    subj = data.get("subject_signing_pubkey_hex")
    root_name = data.get("root_organization_name")
    org_pk = data.get("root_organization_signing_public_key_hex")
    disp_raw = data.get("operator_display_name")
    svg_raw = data.get("root_organization_logo_svg")
    img_b64_raw = data.get("bootstrap_operator_profile_image_base64")
    img_mime_raw = data.get("bootstrap_operator_profile_image_mime")
    if not isinstance(cid, str) or not isinstance(subj, str):
        raise ValueError("challenge_id and subject_signing_pubkey_hex must be strings")
    if not isinstance(root_name, str) or not isinstance(org_pk, str):
        raise ValueError(
            "root_organization_name and root_organization_signing_public_key_hex "
            "must be strings",
        )
    if cid.strip() == "" or subj.strip() == "":
        raise ValueError(
            "challenge_id and subject_signing_pubkey_hex must be non-empty",
        )
    if root_name.strip() == "" or org_pk.strip() == "":
        raise ValueError(
            "root_organization_name and root_organization_signing_public_key_hex "
            "must be non-empty",
        )
    display: str | None
    if disp_raw is None:
        display = None
    elif isinstance(disp_raw, str):
        display = disp_raw.strip() or None
    else:
        raise ValueError("operator_display_name must be a string or null")

    logo_svg: str | None
    if svg_raw is None:
        logo_svg = None
    elif isinstance(svg_raw, str):
        logo_svg = svg_raw if svg_raw.strip() else None
    else:
        raise ValueError("root_organization_logo_svg must be a string or null")

    img_bytes: bytes | None = None
    img_mime: str | None = None
    has_b64 = img_b64_raw is not None
    has_mime = img_mime_raw is not None
    if has_b64 != has_mime:
        raise ValueError(
            "bootstrap_operator_profile_image_base64 and "
            "bootstrap_operator_profile_image_mime must both be set or both omitted",
        )
    if has_b64:
        if not isinstance(img_b64_raw, str) or not isinstance(img_mime_raw, str):
            raise ValueError(
                "bootstrap_operator_profile_image_base64 and "
                "bootstrap_operator_profile_image_mime must be strings",
            )
        b64 = img_b64_raw.strip().replace("\n", "").replace("\r", "")
        if not b64:
            raise ValueError(
                "bootstrap_operator_profile_image_base64 must be non-empty",
            )
        mime = img_mime_raw.strip().lower()
        if not mime:
            raise ValueError("bootstrap_operator_profile_image_mime must be non-empty")
        try:
            img_bytes = base64.b64decode(b64, validate=True)
        except binascii.Error as e:
            raise ValueError(
                "bootstrap_operator_profile_image_base64 must be valid standard base64",
            ) from e
        img_mime = mime

    return GenesisCompleteParsed(
        challenge_id=cid.strip().lower(),
        subject_signing_pubkey_hex=subj.strip(),
        root_organization_name=root_name.strip(),
        root_organization_signing_public_key_hex=org_pk.strip(),
        operator_display_name=display,
        root_organization_logo_svg=logo_svg,
        operator_profile_image_bytes=img_bytes,
        operator_profile_image_mime=img_mime,
    )

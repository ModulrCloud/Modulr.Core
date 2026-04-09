"""Parse genesis wizard JSON bodies (shared by HTTP handlers and CLI)."""

from __future__ import annotations

from typing import Any


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


def parse_genesis_complete_body(
    data: Any,
) -> tuple[str, str, str, str, str | None]:
    """
    Extract genesis completion fields from a parsed JSON object.

    Returns:
        Tuple of ``challenge_id`` (lowercase hex), ``subject_signing_pubkey_hex``,
        ``root_organization_name``, ``root_organization_signing_public_key_hex``,
        and optional ``operator_display_name``.

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
    return (
        cid.strip().lower(),
        subj.strip(),
        root_name.strip(),
        org_pk.strip(),
        display,
    )

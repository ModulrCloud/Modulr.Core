"""In-process genesis wizard steps (HTTP routes and ``modulr-core genesis``)."""

from __future__ import annotations

import sqlite3
from typing import Any

from modulr_core.clock import EpochClock
from modulr_core.genesis.challenge import GenesisChallengeService
from modulr_core.genesis.completion import (
    complete_genesis,
    validate_genesis_root_organization_label,
)
from modulr_core.repositories.core_genesis import CoreGenesisRepository
from modulr_core.repositories.genesis_challenge import GenesisChallengeRepository
from modulr_core.repositories.name_bindings import NameBindingsRepository


def genesis_issue_challenge_payload(
    *,
    conn: sqlite3.Connection,
    clock: EpochClock,
    subject_signing_pubkey_hex: str,
) -> dict[str, Any]:
    """
    Issue a genesis challenge (caller commits on success).

    Returns:
        Payload object for ``GENESIS_CHALLENGE_ISSUED`` success envelope.
    """
    svc = GenesisChallengeService(
        genesis_repo=CoreGenesisRepository(conn),
        challenge_repo=GenesisChallengeRepository(conn),
        clock=clock,
    )
    issued = svc.issue(subject_signing_pubkey_hex=subject_signing_pubkey_hex)
    return {
        "challenge_id": issued.challenge_id,
        "challenge_body": issued.body,
        "issued_at_unix": issued.issued_at_unix,
        "expires_at_unix": issued.expires_at_unix,
    }


def genesis_verify_challenge_payload(
    *,
    conn: sqlite3.Connection,
    clock: EpochClock,
    challenge_id: str,
    signature_hex: str,
) -> dict[str, Any]:
    """
    Verify and consume a challenge (caller commits on success).

    Returns:
        Payload object for ``GENESIS_CHALLENGE_VERIFIED`` success envelope.
    """
    svc = GenesisChallengeService(
        genesis_repo=CoreGenesisRepository(conn),
        challenge_repo=GenesisChallengeRepository(conn),
        clock=clock,
    )
    svc.verify_and_consume(challenge_id=challenge_id, signature_hex=signature_hex)
    return {"verified": True}


def genesis_complete_payload(
    *,
    conn: sqlite3.Connection,
    clock: EpochClock,
    challenge_id: str,
    subject_signing_pubkey_hex: str,
    root_organization_name: str,
    root_organization_signing_public_key_hex: str,
    operator_display_name: str | None,
) -> dict[str, Any]:
    """
    Complete the genesis wizard (caller commits on success).

    Returns:
        Payload object for ``GENESIS_WIZARD_COMPLETED`` success envelope.
    """
    complete_genesis(
        genesis_repo=CoreGenesisRepository(conn),
        challenge_repo=GenesisChallengeRepository(conn),
        name_repo=NameBindingsRepository(conn),
        clock=clock,
        challenge_id=challenge_id,
        subject_signing_pubkey_hex=subject_signing_pubkey_hex,
        root_organization_name=root_organization_name,
        root_organization_signing_public_key_hex=root_organization_signing_public_key_hex,
        operator_display_name=operator_display_name,
    )
    g = CoreGenesisRepository(conn).get()
    norm_root = validate_genesis_root_organization_label(root_organization_name)
    return {
        "genesis_complete": True,
        "root_organization_name": norm_root,
        "root_organization_resolved_id": (
            root_organization_signing_public_key_hex.strip().lower()
        ),
        "bootstrap_signing_pubkey_hex": g.bootstrap_signing_pubkey_hex,
        "operator_display_name": g.bootstrap_operator_display_name,
    }

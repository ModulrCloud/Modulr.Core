"""Guarded genesis wizard reset (local/testnet lab only)."""

from __future__ import annotations

import os
import sqlite3

from modulr_core.clock import EpochClock
from modulr_core.config.schema import Settings
from modulr_core.genesis.completion import validate_genesis_root_organization_label
from modulr_core.repositories.core_genesis import CoreGenesisRepository
from modulr_core.repositories.genesis_challenge import GenesisChallengeRepository
from modulr_core.repositories.name_bindings import NameBindingsRepository


class GenesisResetError(Exception):
    """Reset cannot proceed (missing label, policy)."""


def genesis_reset_allowed(settings: Settings) -> bool:
    """Return whether guarded reset is permitted for this process configuration.

    Requires :func:`~modulr_core.config.schema.Settings.genesis_operations_allowed`
    plus either ``dev_mode`` or :envvar:`MODULR_ALLOW_GENESIS_RESET` set to ``1``.
    """
    if not settings.genesis_operations_allowed():
        return False
    if settings.dev_mode:
        return True
    return os.environ.get("MODULR_ALLOW_GENESIS_RESET", "").strip() == "1"


def reset_genesis_state(
    *,
    conn: sqlite3.Connection,
    clock: EpochClock,
    genesis_repo: CoreGenesisRepository,
    challenge_repo: GenesisChallengeRepository,
    name_repo: NameBindingsRepository,
    root_organization_name_override: str | None = None,
) -> dict[str, object]:
    """
    Clear genesis challenges and wizard state so the first-boot flow can run again.

    When ``genesis_complete`` was true, removes the stored root ``name_bindings``
    row when we know the label (from ``core_genesis`` or the override argument).

    Args:
        conn: Open SQLite connection (caller commits).
        clock: Unix epoch seconds.
        genesis_repo: Singleton genesis row.
        challenge_repo: Challenge table.
        name_repo: Name bindings.
        root_organization_name_override: Use when the stored root label column is
            unset (e.g. legacy DB) but a root binding must be removed.

    Returns:
        Summary fields for logging or CLI JSON.

    Raises:
        GenesisResetError: If a completed genesis needs a label override and none
            was provided.
        modulr_core.genesis.completion.GenesisCompletionError: If the override label
            is invalid.
    """
    now = int(clock())
    snap = genesis_repo.get()
    label = snap.genesis_root_organization_label
    if label is None and root_organization_name_override:
        label = validate_genesis_root_organization_label(
            root_organization_name_override
        )

    if snap.genesis_complete and label is None:
        raise GenesisResetError(
            "genesis is marked complete but genesis_root_organization_label is "
            "unset; pass --root-organization-name with the same single-label root "
            "name used when completing the wizard (e.g. modulr) so the name "
            "binding can be removed",
        )

    name_removed = False
    if snap.genesis_complete and label is not None:
        name_removed = name_repo.delete_by_name(label)

    n_ch = challenge_repo.delete_all()
    genesis_repo.clear_genesis_wizard_state(updated_at=now)

    return {
        "reset": True,
        "genesis_was_complete": snap.genesis_complete,
        "challenges_deleted": n_ch,
        "name_binding_removed": name_removed,
        "root_organization_label_used": label,
    }

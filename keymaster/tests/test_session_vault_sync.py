"""All unlocked sessions see the same vault after replace_session_vault."""

from __future__ import annotations

from modulr_keymaster.profiles import new_profile
from modulr_keymaster.sessions import (
    SessionRecord,
    UnlockedVault,
    replace_session_vault,
)


def test_replace_session_vault_updates_every_active_session() -> None:
    empty = UnlockedVault([])
    sessions = {
        "tab-a": SessionRecord(vault=empty),
        "tab-b": SessionRecord(vault=empty),
    }
    added = new_profile("sync-test")
    updated = UnlockedVault([added])

    ok = replace_session_vault(sessions, "tab-a", updated)

    assert ok is True
    assert sessions["tab-a"].vault is updated
    assert sessions["tab-b"].vault is updated
    assert sessions["tab-b"].vault.profiles[0].display_name == "sync-test"

"""Session idle / max-lifetime pruning."""

from __future__ import annotations

import pytest

from modulr_keymaster.sessions import (
    SESSION_IDLE_TIMEOUT_SEC,
    SESSION_MAX_LIFETIME_SEC,
    SessionRecord,
    UnlockedVault,
    prune_expired_sessions,
    resolve_unlocked_vault,
)


def test_prune_removes_idle_session() -> None:
    vault = UnlockedVault([])
    now = 10_000.0
    sessions = {
        "sid": SessionRecord(
            vault=vault,
            created_mono=now - 60.0,
            last_seen_mono=now - SESSION_IDLE_TIMEOUT_SEC - 1.0,
        ),
    }
    prune_expired_sessions(sessions, now=now)
    assert "sid" not in sessions


def test_prune_removes_max_lifetime_session() -> None:
    vault = UnlockedVault([])
    now = 10_000.0
    sessions = {
        "sid": SessionRecord(
            vault=vault,
            created_mono=now - SESSION_MAX_LIFETIME_SEC - 1.0,
            last_seen_mono=now,
        ),
    }
    prune_expired_sessions(sessions, now=now)
    assert "sid" not in sessions


def test_resolve_drops_expired_sid(monkeypatch: pytest.MonkeyPatch) -> None:
    vault = UnlockedVault([])
    now = 10_000.0
    monkeypatch.setattr("modulr_keymaster.sessions.time.monotonic", lambda: now)
    sessions = {
        "gone": SessionRecord(
            vault=vault,
            created_mono=now - SESSION_MAX_LIFETIME_SEC - 5.0,
            last_seen_mono=now - 1.0,
        ),
    }
    assert resolve_unlocked_vault(sessions, "gone") is None
    assert "gone" not in sessions
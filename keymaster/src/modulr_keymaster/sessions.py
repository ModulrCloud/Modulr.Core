"""Server-side unlock state (keys stay in RAM; cookie holds opaque session id only)."""

from __future__ import annotations

import secrets
import time
from collections.abc import MutableMapping
from dataclasses import dataclass, field

from modulr_keymaster.profiles import ProfileSecrets

SESSION_COOKIE = "keymaster_session"

# Drop in-memory vault copies when idle (lost cookie / closed tab) or max age reached.
SESSION_IDLE_TIMEOUT_SEC = 30 * 60
SESSION_MAX_LIFETIME_SEC = 8 * 3600


@dataclass
class UnlockedVault:
    profiles: list[ProfileSecrets]


@dataclass
class SessionRecord:
    vault: UnlockedVault
    created_mono: float = field(default_factory=time.monotonic)
    last_seen_mono: float = field(default_factory=time.monotonic)

    def touch(self) -> None:
        self.last_seen_mono = time.monotonic()

    def is_expired(self, now: float) -> bool:
        if now - self.last_seen_mono > SESSION_IDLE_TIMEOUT_SEC:
            return True
        if now - self.created_mono > SESSION_MAX_LIFETIME_SEC:
            return True
        return False


def prune_expired_sessions(
    sessions: MutableMapping[str, SessionRecord],
    *,
    now: float | None = None,
) -> None:
    """Drop sessions past idle or max lifetime (orphaned cookies included)."""
    t = time.monotonic() if now is None else now
    dead = [sid for sid, rec in sessions.items() if rec.is_expired(t)]
    for sid in dead:
        del sessions[sid]


def resolve_unlocked_vault(
    sessions: MutableMapping[str, SessionRecord],
    sid: str | None,
) -> UnlockedVault | None:
    """Return vault for sid if present and not expired; refresh last_seen."""
    if not sid:
        return None
    rec = sessions.get(sid)
    if rec is None:
        return None
    now = time.monotonic()
    if rec.is_expired(now):
        del sessions[sid]
        return None
    rec.touch()
    return rec.vault


def new_session_id(
    sessions: MutableMapping[str, SessionRecord],
    vault: UnlockedVault,
) -> str:
    """Register a new unlock session; returns opaque sid."""
    prune_expired_sessions(sessions)
    sid = secrets.token_urlsafe(32)
    sessions[sid] = SessionRecord(vault=vault)
    return sid


def find_profile(vault: UnlockedVault, profile_id: str) -> ProfileSecrets | None:
    for p in vault.profiles:
        if p.id == profile_id:
            return p
    return None


def replace_session_vault(
    sessions: MutableMapping[str, SessionRecord],
    sid: str | None,
    vault: UnlockedVault,
) -> bool:
    """Swap in-memory profiles after a disk write; returns False if sid missing."""
    if not sid:
        return False
    rec = sessions.get(sid)
    if rec is None:
        return False
    rec.vault = vault
    rec.touch()
    return True

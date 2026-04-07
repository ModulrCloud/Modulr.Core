"""Server-side unlock state (keys stay in RAM; cookie holds opaque session id only)."""

from __future__ import annotations

from dataclasses import dataclass

from modulr_keymaster.profiles import ProfileSecrets

SESSION_COOKIE = "keymaster_session"


@dataclass
class UnlockedVault:
    profiles: list[ProfileSecrets]


def find_profile(vault: UnlockedVault, profile_id: str) -> ProfileSecrets | None:
    for p in vault.profiles:
        if p.id == profile_id:
            return p
    return None

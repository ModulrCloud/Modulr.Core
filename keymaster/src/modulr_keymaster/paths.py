"""Filesystem locations for Keymaster data (outside the git clone by default)."""

from __future__ import annotations

import os
from pathlib import Path


def vault_dir() -> Path:
    """Directory containing `vault.json`; created on first vault setup."""
    override = os.environ.get("KEYMASTER_VAULT_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return (Path.home() / ".modulr" / "keymaster").resolve()


def vault_json_path() -> Path:
    """Absolute path to the encrypted vault file."""
    override = os.environ.get("KEYMASTER_VAULT_PATH", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return vault_dir() / "vault.json"


def vault_exists() -> bool:
    return vault_json_path().is_file()

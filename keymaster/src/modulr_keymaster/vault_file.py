"""Read/write `vault.json` with atomic replace."""

from __future__ import annotations

import json
import os
import stat
from pathlib import Path
from typing import Any


def _chmod_owner_only(path: Path) -> None:
    """Unix: 0o600. Windows ACL model differs; skip chmod there."""
    if os.name == "nt":
        return
    try:
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass


def read_envelope(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("vault file must contain a JSON object")
    return data


def write_envelope(path: Path, envelope: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        try:
            path.parent.chmod(0o700)
        except OSError:
            pass
    tmp = path.with_suffix(".tmp")
    payload = json.dumps(envelope, indent=2, sort_keys=True) + "\n"
    tmp.write_text(payload, encoding="utf-8")
    _chmod_owner_only(tmp)
    tmp.replace(path)
    _chmod_owner_only(path)

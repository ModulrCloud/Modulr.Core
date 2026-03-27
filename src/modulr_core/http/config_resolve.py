"""Resolve operator config path: CLI wins over ``MODULR_CORE_CONFIG``."""

from __future__ import annotations

import os
from pathlib import Path

from modulr_core.errors.exceptions import ConfigurationError

_ENV_VAR = "MODULR_CORE_CONFIG"


def resolve_config_path(cli_path: str | Path | None) -> Path:
    """Return path from ``cli_path`` if set, else from :envvar:`MODULR_CORE_CONFIG`."""
    if cli_path is not None and str(cli_path).strip():
        return Path(cli_path)
    env = os.environ.get(_ENV_VAR)
    if env and env.strip():
        return Path(env)
    raise ConfigurationError(
        f"No configuration path: pass --config or set {_ENV_VAR} to a TOML file.",
    )

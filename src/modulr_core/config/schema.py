"""Typed operator settings (loaded from TOML in :mod:`modulr_core.config.load`)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# Default relative to the process current working directory when omitted in TOML.
DEFAULT_DATABASE_PATH = Path("data/modulr_core.sqlite")

DEFAULT_MAX_HTTP_BODY_BYTES = 2_097_152  # 2 MiB
DEFAULT_MAX_PAYLOAD_BYTES = 1_048_576  # 1 MiB
DEFAULT_MAX_EXPIRY_WINDOW_SECONDS = 604_800  # 7 days
DEFAULT_FUTURE_TIMESTAMP_SKEW_SECONDS = 300  # 5 minutes
DEFAULT_REPLAY_WINDOW_SECONDS = 86_400  # 24 hours
DEFAULT_DEV_MODE = False


@dataclass(frozen=True)
class Settings:
    """Validated operator configuration for Modulr.Core."""

    bootstrap_public_keys: tuple[str, ...]
    """Wire-format Ed25519 public keys: lowercase hex, 64 characters each."""

    database_path: Path
    max_http_body_bytes: int
    max_payload_bytes: int
    max_expiry_window_seconds: int
    future_timestamp_skew_seconds: int
    replay_window_seconds: int
    dev_mode: bool

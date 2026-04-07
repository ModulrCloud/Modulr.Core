"""Typed operator settings (loaded from TOML in :mod:`modulr_core.config.load`)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

# Default path segment when omitted in TOML. With :func:`load_settings`, a relative
# value is resolved against the config file's directory (not process CWD).
DEFAULT_DATABASE_PATH = Path("data/modulr_core.sqlite")

DEFAULT_MAX_HTTP_BODY_BYTES = 2_097_152  # 2 MiB
DEFAULT_MAX_PAYLOAD_BYTES = 1_048_576  # 1 MiB
DEFAULT_MAX_EXPIRY_WINDOW_SECONDS = 604_800  # 7 days
DEFAULT_FUTURE_TIMESTAMP_SKEW_SECONDS = 300  # 5 minutes
DEFAULT_REPLAY_WINDOW_SECONDS = 86_400  # 24 hours
DEFAULT_DEV_MODE = False

NETWORK_NAME_MAX_LEN = 64


class NetworkEnvironment(StrEnum):
    """Deployment tier: genesis tooling allowed on local and testnet only."""

    LOCAL = "local"
    TESTNET = "testnet"
    PRODUCTION = "production"


# Omitted in TOML → production (safe default for real deploys).
DEFAULT_NETWORK_ENVIRONMENT = NetworkEnvironment.PRODUCTION

_DEFAULT_DISPLAY_NAMES: dict[NetworkEnvironment, str] = {
    NetworkEnvironment.LOCAL: "Modulr (local)",
    NetworkEnvironment.TESTNET: "Modulr (testnet)",
    NetworkEnvironment.PRODUCTION: "Modulr (production)",
}


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
    network_environment: NetworkEnvironment
    """``local`` / ``testnet`` may expose genesis flows; ``production`` must not."""
    network_name: str
    """Custom name for UIs (e.g. chain name). If empty, a tier default is used."""

    def genesis_operations_allowed(self) -> bool:
        """True when genesis wizard / reset may run (non-production tiers)."""
        return self.network_environment in (
            NetworkEnvironment.LOCAL,
            NetworkEnvironment.TESTNET,
        )

    def resolved_network_display_name(self) -> str:
        """Operator-facing network title for UIs and :http:get:`/version`."""
        if self.network_name.strip():
            return self.network_name.strip()
        return _DEFAULT_DISPLAY_NAMES[self.network_environment]

"""Load and validate operator settings from TOML."""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from modulr_core.config.schema import (
    DEFAULT_DATABASE_PATH,
    DEFAULT_DEV_MODE,
    DEFAULT_FUTURE_TIMESTAMP_SKEW_SECONDS,
    DEFAULT_MAX_EXPIRY_WINDOW_SECONDS,
    DEFAULT_MAX_HTTP_BODY_BYTES,
    DEFAULT_MAX_PAYLOAD_BYTES,
    DEFAULT_NETWORK_ENVIRONMENT,
    DEFAULT_REPLAY_WINDOW_SECONDS,
    NETWORK_NAME_MAX_LEN,
    NetworkEnvironment,
    Settings,
)
from modulr_core.errors.exceptions import ConfigurationError, InvalidHexEncoding
from modulr_core.validation.hex_codec import decode_hex_fixed

_CONFIG_TABLE = "modulr_core"


def load_settings(path: str | Path) -> Settings:
    """Read TOML from ``path`` and return validated :class:`Settings`."""
    p = Path(path)
    try:
        data = p.read_bytes()
    except FileNotFoundError as e:
        raise ConfigurationError(f"configuration file not found: {p}") from e
    return load_settings_from_bytes(
        data,
        source=str(p),
        config_file_dir=p.resolve().parent,
    )


def load_settings_from_str(toml: str) -> Settings:
    """Parse TOML from a string (e.g. tests); encoding must be UTF-8."""
    return load_settings_from_bytes(toml.encode("utf-8"), source="<string>")


def load_settings_from_bytes(
    data: bytes,
    *,
    source: str,
    config_file_dir: Path | None = None,
) -> Settings:
    """Parse TOML from UTF-8 bytes and return validated :class:`Settings`."""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as e:
        raise ConfigurationError(
            f"configuration is not valid UTF-8 ({source}): {e}",
        ) from e
    try:
        root = tomllib.loads(text)
    except tomllib.TOMLDecodeError as e:
        raise ConfigurationError(f"invalid TOML ({source}): {e}") from e
    return _settings_from_root(root, source=source, config_file_dir=config_file_dir)


def _settings_from_root(
    root: dict[str, Any],
    *,
    source: str,
    config_file_dir: Path | None = None,
) -> Settings:
    if _CONFIG_TABLE not in root:
        raise ConfigurationError(
            f"missing [{_CONFIG_TABLE}] table in configuration ({source})",
        )
    table = root[_CONFIG_TABLE]
    if not isinstance(table, dict):
        raise ConfigurationError(
            f"[{_CONFIG_TABLE}] must be a table ({source})",
        )

    dev_mode = _bool_opt(table, "dev_mode", DEFAULT_DEV_MODE, source)
    network_environment = _network_environment_opt(table, source)
    network_name = _network_name_opt(table, source)
    if network_environment is NetworkEnvironment.PRODUCTION and dev_mode:
        raise ConfigurationError(
            f'network_environment "production" cannot be combined with dev_mode true '
            f"({source})",
        )
    keys = _bootstrap_public_keys(table.get("bootstrap_public_keys"), source, dev_mode)

    database_path = _path_opt(
        table,
        "database_path",
        DEFAULT_DATABASE_PATH,
        source,
    )
    if not database_path.is_absolute() and config_file_dir is not None:
        database_path = (config_file_dir / database_path).resolve()
    max_http_body = _int_opt(
        table,
        "max_http_body_bytes",
        DEFAULT_MAX_HTTP_BODY_BYTES,
        source,
    )
    max_payload = _int_opt(
        table,
        "max_payload_bytes",
        DEFAULT_MAX_PAYLOAD_BYTES,
        source,
    )
    max_expiry = _int_opt(
        table,
        "max_expiry_window_seconds",
        DEFAULT_MAX_EXPIRY_WINDOW_SECONDS,
        source,
    )
    skew = _int_opt(
        table,
        "future_timestamp_skew_seconds",
        DEFAULT_FUTURE_TIMESTAMP_SKEW_SECONDS,
        source,
    )
    replay = _int_opt(
        table,
        "replay_window_seconds",
        DEFAULT_REPLAY_WINDOW_SECONDS,
        source,
    )

    _positive_int("max_http_body_bytes", max_http_body, source)
    _positive_int("max_payload_bytes", max_payload, source)
    _positive_int("max_expiry_window_seconds", max_expiry, source)
    _positive_int("future_timestamp_skew_seconds", skew, source)
    _positive_int("replay_window_seconds", replay, source)

    if max_payload > max_http_body:
        raise ConfigurationError(
            f"max_payload_bytes ({max_payload}) must be <= "
            f"max_http_body_bytes ({max_http_body}) ({source})",
        )

    return Settings(
        bootstrap_public_keys=keys,
        database_path=database_path,
        max_http_body_bytes=max_http_body,
        max_payload_bytes=max_payload,
        max_expiry_window_seconds=max_expiry,
        future_timestamp_skew_seconds=skew,
        replay_window_seconds=replay,
        dev_mode=dev_mode,
        network_environment=network_environment,
        network_name=network_name,
    )


def _bootstrap_public_keys(
    raw: Any,
    source: str,
    dev_mode: bool,
) -> tuple[str, ...]:
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        raise ConfigurationError(
            f"bootstrap_public_keys must be a list ({source})",
        )
    seen: set[str] = set()
    out: list[str] = []
    for i, item in enumerate(raw):
        if not isinstance(item, str):
            raise ConfigurationError(
                f"bootstrap_public_keys[{i}] must be a string ({source})",
            )
        key = item.strip()
        if key in seen:
            raise ConfigurationError(
                f"duplicate bootstrap_public_keys entry at index {i} ({source})",
            )
        seen.add(key)
        try:
            pk_bytes = decode_hex_fixed(key, byte_length=32)
            Ed25519PublicKey.from_public_bytes(pk_bytes)
        except InvalidHexEncoding as e:
            raise ConfigurationError(
                f"bootstrap_public_keys[{i}] invalid hex: {e} ({source})",
            ) from e
        except ValueError as e:
            raise ConfigurationError(
                f"bootstrap_public_keys[{i}] invalid Ed25519 public key: {e} "
                f"({source})",
            ) from e
        out.append(key)

    if not out and not dev_mode:
        raise ConfigurationError(
            "bootstrap_public_keys must be non-empty when dev_mode is false "
            f"({source})",
        )
    return tuple(out)


def _network_environment_opt(
    table: dict[str, Any],
    source: str,
) -> NetworkEnvironment:
    key = "network_environment"
    if key not in table:
        return DEFAULT_NETWORK_ENVIRONMENT
    v = table[key]
    if not isinstance(v, str) or not v.strip():
        raise ConfigurationError(
            f"network_environment must be a non-empty string ({source})",
        )
    raw = v.strip().lower()
    try:
        return NetworkEnvironment(raw)
    except ValueError:
        raise ConfigurationError(
            f'network_environment must be "local", "testnet", or "production" '
            f"({source})",
        ) from None


def _network_name_opt(table: dict[str, Any], source: str) -> str:
    key = "network_name"
    if key not in table:
        return ""
    v = table[key]
    if not isinstance(v, str):
        raise ConfigurationError(
            f"network_name must be a string ({source})",
        )
    name = v.strip()
    if len(name) > NETWORK_NAME_MAX_LEN:
        raise ConfigurationError(
            f"network_name must be at most {NETWORK_NAME_MAX_LEN} characters "
            f"({source})",
        )
    return name


def _bool_opt(table: dict[str, Any], key: str, default: bool, source: str) -> bool:
    if key not in table:
        return default
    v = table[key]
    if not isinstance(v, bool):
        raise ConfigurationError(f"{key} must be a boolean ({source})")
    return v


def _path_opt(
    table: dict[str, Any],
    key: str,
    default: Path,
    source: str,
) -> Path:
    if key not in table:
        return default
    v = table[key]
    if not isinstance(v, str) or not v.strip():
        raise ConfigurationError(
            f"{key} must be a non-empty string ({source})",
        )
    return Path(v)


def _int_opt(
    table: dict[str, Any],
    key: str,
    default: int,
    source: str,
) -> int:
    if key not in table:
        return default
    v = table[key]
    if not isinstance(v, int) or isinstance(v, bool):
        raise ConfigurationError(f"{key} must be an integer ({source})")
    return v


def _positive_int(name: str, value: int, source: str) -> None:
    if value <= 0:
        raise ConfigurationError(
            f"{name} must be positive, got {value} ({source})",
        )

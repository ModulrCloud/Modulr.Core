"""Phase F: TOML operator configuration."""

from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from modulr_core import ConfigurationError
from modulr_core.config import (
    DEFAULT_DATABASE_PATH,
    DEFAULT_DEV_MODE,
    DEFAULT_FUTURE_TIMESTAMP_SKEW_SECONDS,
    DEFAULT_MAX_EXPIRY_WINDOW_SECONDS,
    DEFAULT_MAX_HTTP_BODY_BYTES,
    DEFAULT_MAX_PAYLOAD_BYTES,
    DEFAULT_REPLAY_WINDOW_SECONDS,
    NETWORK_NAME_MAX_LEN,
    NetworkEnvironment,
    Settings,
    load_settings,
    load_settings_from_bytes,
    load_settings_from_str,
)


def _valid_hex_pubkey() -> str:
    pk = Ed25519PrivateKey.generate().public_key()
    return pk.public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw).hex()


def test_minimal_config_with_one_key() -> None:
    k = _valid_hex_pubkey()
    s = load_settings_from_str(
        f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
""",
    )
    assert isinstance(s, Settings)
    assert s.bootstrap_public_keys == (k,)
    assert s.database_path == DEFAULT_DATABASE_PATH
    assert s.max_http_body_bytes == DEFAULT_MAX_HTTP_BODY_BYTES
    assert s.max_payload_bytes == DEFAULT_MAX_PAYLOAD_BYTES
    assert s.max_expiry_window_seconds == DEFAULT_MAX_EXPIRY_WINDOW_SECONDS
    assert s.future_timestamp_skew_seconds == DEFAULT_FUTURE_TIMESTAMP_SKEW_SECONDS
    assert s.replay_window_seconds == DEFAULT_REPLAY_WINDOW_SECONDS
    assert s.dev_mode is DEFAULT_DEV_MODE
    assert s.network_environment is NetworkEnvironment.PRODUCTION
    assert s.network_name == ""
    assert s.cors_extra_origins == ()
    assert s.genesis_operations_allowed() is False
    assert s.resolved_network_display_name() == "Modulr (production)"


def test_full_config_overrides() -> None:
    k = _valid_hex_pubkey()
    s = load_settings_from_str(
        f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
database_path = "custom/db.sqlite"
max_http_body_bytes = 100_000
max_payload_bytes = 99_999
max_expiry_window_seconds = 3600
future_timestamp_skew_seconds = 60
replay_window_seconds = 120
dev_mode = true
network_environment = "testnet"
network_name = "Holesky-style"
""",
    )
    assert s.database_path == Path("custom/db.sqlite")
    assert s.max_http_body_bytes == 100_000
    assert s.max_payload_bytes == 99_999
    assert s.max_expiry_window_seconds == 3600
    assert s.future_timestamp_skew_seconds == 60
    assert s.replay_window_seconds == 120
    assert s.dev_mode is True
    assert s.network_environment is NetworkEnvironment.TESTNET
    assert s.network_name == "Holesky-style"
    assert s.genesis_operations_allowed() is True
    assert s.resolved_network_display_name() == "Holesky-style"


def test_cors_extra_origins_from_toml() -> None:
    k = _valid_hex_pubkey()
    s = load_settings_from_str(
        f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
cors_extra_origins = [
  "http://10.0.0.53:3000",
  "https://10.0.0.53:3000",
]
""",
    )
    assert s.cors_extra_origins == (
        "http://10.0.0.53:3000",
        "https://10.0.0.53:3000",
    )


def test_cors_extra_origins_rejects_bad_scheme() -> None:
    k = _valid_hex_pubkey()
    with pytest.raises(ConfigurationError, match="http:// or https://"):
        load_settings_from_str(
            f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
cors_extra_origins = [ "ftp://bad.example" ]
""",
        )


def test_dev_mode_allows_empty_bootstrap() -> None:
    s = load_settings_from_str(
        """
[modulr_core]
dev_mode = true
network_environment = "local"
bootstrap_public_keys = []
""",
    )
    assert s.bootstrap_public_keys == ()
    assert s.dev_mode is True
    assert s.network_environment is NetworkEnvironment.LOCAL


def test_missing_modulr_core_table() -> None:
    with pytest.raises(ConfigurationError, match="missing \\[modulr_core\\]"):
        load_settings_from_str("other = 1\n")


def test_invalid_toml() -> None:
    with pytest.raises(ConfigurationError, match="invalid TOML"):
        load_settings_from_str("[modulr_core\n")


def test_load_settings_missing_file() -> None:
    with pytest.raises(ConfigurationError, match="not found"):
        load_settings(Path("nonexistent-modulr-config-xyz.toml"))


def test_non_utf8_bytes_raise_configuration_error() -> None:
    with pytest.raises(ConfigurationError, match="not valid UTF-8"):
        load_settings_from_bytes(b"\xff\xfe\x00", source="<test>")


def test_non_empty_bootstrap_required_when_not_dev() -> None:
    with pytest.raises(ConfigurationError, match="non-empty when dev_mode is false"):
        load_settings_from_str(
            """
[modulr_core]
bootstrap_public_keys = []
""",
        )


def test_bootstrap_must_be_list() -> None:
    with pytest.raises(ConfigurationError, match="must be a list"):
        load_settings_from_str(
            """
[modulr_core]
bootstrap_public_keys = "x"
""",
        )


def test_duplicate_bootstrap_key() -> None:
    k = _valid_hex_pubkey()
    with pytest.raises(ConfigurationError, match="duplicate"):
        load_settings_from_str(
            f"""
[modulr_core]
bootstrap_public_keys = ["{k}", "{k}"]
""",
        )


def test_bootstrap_bad_hex_length() -> None:
    with pytest.raises(ConfigurationError, match="invalid hex"):
        load_settings_from_str(
            """
[modulr_core]
bootstrap_public_keys = ["abcd"]
""",
        )


def test_bootstrap_uppercase_hex_rejected() -> None:
    k = _valid_hex_pubkey().upper()
    with pytest.raises(ConfigurationError, match="invalid hex"):
        load_settings_from_str(
            f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
""",
        )


def test_payload_larger_than_body_rejected() -> None:
    k = _valid_hex_pubkey()
    with pytest.raises(ConfigurationError, match="max_payload_bytes"):
        load_settings_from_str(
            f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
max_http_body_bytes = 100
max_payload_bytes = 200
""",
        )


def test_positive_integer_enforced() -> None:
    k = _valid_hex_pubkey()
    with pytest.raises(ConfigurationError, match="max_http_body_bytes"):
        load_settings_from_str(
            f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
max_http_body_bytes = 0
""",
        )


def test_load_settings_reads_file(tmp_path: Path) -> None:
    k = _valid_hex_pubkey()
    p = tmp_path / "cfg.toml"
    p.write_text(
        f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
""",
        encoding="utf-8",
    )
    s = load_settings(p)
    assert k in s.bootstrap_public_keys
    assert s.database_path == (tmp_path / "data" / "modulr_core.sqlite").resolve()


def test_load_settings_relative_database_path_is_resolved_vs_config_dir(
    tmp_path: Path,
) -> None:
    k = _valid_hex_pubkey()
    cfg_dir = tmp_path / "nested"
    cfg_dir.mkdir()
    p = cfg_dir / "cfg.toml"
    p.write_text(
        f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
database_path = "state/db.sqlite"
""",
        encoding="utf-8",
    )
    s = load_settings(p)
    assert s.database_path == (cfg_dir / "state" / "db.sqlite").resolve()


def test_network_environment_invalid() -> None:
    k = _valid_hex_pubkey()
    with pytest.raises(ConfigurationError, match="network_environment must be"):
        load_settings_from_str(
            f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
network_environment = "mainnet"
""",
        )


def test_network_name_too_long() -> None:
    k = _valid_hex_pubkey()
    with pytest.raises(ConfigurationError, match="network_name must be at most"):
        load_settings_from_str(
            f"""
[modulr_core]
bootstrap_public_keys = ["{k}"]
network_name = "{'x' * (NETWORK_NAME_MAX_LEN + 1)}"
""",
        )


def test_production_with_dev_mode_rejected() -> None:
    k = _valid_hex_pubkey()
    with pytest.raises(ConfigurationError, match="cannot be combined"):
        load_settings_from_str(
            f"""
[modulr_core]
dev_mode = true
network_environment = "production"
bootstrap_public_keys = ["{k}"]
""",
        )

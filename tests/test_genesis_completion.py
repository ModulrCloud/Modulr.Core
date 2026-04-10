"""Genesis completion validation (root org label, org Ed25519 id)."""

from __future__ import annotations

import pytest

from modulr_core.genesis.completion import (
    GenesisCompletionError,
    validate_genesis_root_organization_label,
)


def test_validate_genesis_root_organization_label_modulr() -> None:
    assert validate_genesis_root_organization_label("Modulr") == "modulr"


def test_validate_genesis_root_organization_label_allows_emoji() -> None:
    assert validate_genesis_root_organization_label("Modulr 🚀") == "modulr 🚀"


def test_validate_genesis_root_organization_label_length_after_lower() -> None:
    """Turkish İ lowercases to two code points; enforce limit on normalized string."""
    assert len("İ" * 32) == 32
    assert len(("İ" * 32).lower()) == 64
    with pytest.raises(GenesisCompletionError, match="at most 63"):
        validate_genesis_root_organization_label("İ" * 32)


def test_validate_genesis_root_organization_label_rejects_dotted() -> None:
    with pytest.raises(GenesisCompletionError, match="single segment"):
        validate_genesis_root_organization_label("modulr.network")


def test_validate_genesis_root_organization_label_rejects_empty() -> None:
    with pytest.raises(GenesisCompletionError, match="non-empty"):
        validate_genesis_root_organization_label("   ")

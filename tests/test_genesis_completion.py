"""Genesis completion validation (root org label, org Ed25519 id)."""

from __future__ import annotations

import pytest

from modulr_core.genesis.completion import (
    GenesisCompletionError,
    validate_genesis_root_organization_label,
)


def test_validate_genesis_root_organization_label_modulr() -> None:
    assert validate_genesis_root_organization_label("Modulr") == "modulr"


def test_validate_genesis_root_organization_label_rejects_dotted() -> None:
    with pytest.raises(GenesisCompletionError, match="single DNS label"):
        validate_genesis_root_organization_label("modulr.network")


def test_validate_genesis_root_organization_label_rejects_empty() -> None:
    with pytest.raises(GenesisCompletionError, match="non-empty"):
        validate_genesis_root_organization_label("   ")

"""Canonical module name rules (wire ``module_name`` for Core registry)."""

from __future__ import annotations

# Single built-in coordination module; not stored in ``modules`` — see handlers.
CANONICAL_CORE_MODULE_NAME = "modulr.core"

# Deterministic valid Ed25519 public key (hex) labeling the built-in Core row in
# lookup responses. Not used for verification of customer traffic.
BUILTIN_CORE_SIGNING_PUBLIC_KEY_HEX = (
    "17431606931fd51542508e671daec0e02f5c783de721a52142b965ac08001f6e"
)


def normalize_module_name(stripped_wire_name: str) -> str:
    """Return case-folded form stored in SQLite and used for equality (ASCII names)."""
    return stripped_wire_name.lower()

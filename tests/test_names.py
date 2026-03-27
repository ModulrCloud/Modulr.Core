"""Modulr name forms for resolve_name (incl. Modulr.Web user@domain.subdomain)."""

import pytest

from modulr_core import ErrorCode, WireValidationError
from modulr_core.validation import validate_modulr_resolve_name


@pytest.mark.parametrize(
    "raw",
    [
        "@chris",
        "@user_1",
        "chris@modulr.network",
        "user@api.example.com",
        "modulr.network",
        "api.example.com",
    ],
)
def test_validate_modulr_resolve_name_accepts(raw: str) -> None:
    assert validate_modulr_resolve_name(raw) == raw.strip()


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "modulr",
        "user@localhost",
        "@@bad",
        "@",
        "no-at-sign",
    ],
)
def test_validate_modulr_resolve_name_rejects(raw: str) -> None:
    with pytest.raises(WireValidationError) as ei:
        validate_modulr_resolve_name(raw)
    assert ei.value.code is ErrorCode.INVALID_NAME

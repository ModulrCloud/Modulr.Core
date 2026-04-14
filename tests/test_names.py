"""Modulr name forms for resolve_name (incl. Modulr.Web user@domain.subdomain)."""

import pytest

from modulr_core import ErrorCode, WireValidationError
from modulr_core.validation import (
    validate_modulr_org_domain,
    validate_modulr_resolve_name,
    validate_resolved_id,
)


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


@pytest.mark.parametrize(
    "raw",
    [
        "modulr.network",
        "modulr.core",
        "acme",
        "x",
        "a.b",
    ],
)
def test_validate_modulr_org_domain_accepts(raw: str) -> None:
    assert validate_modulr_org_domain(raw) == raw.strip()


@pytest.mark.parametrize(
    "raw",
    [
        "@chris",
        "user@modulr.network",
        "api.example.com",
        "a.b.co",
        "labs.acme.network",
        "",
    ],
)
def test_validate_modulr_org_domain_rejects(raw: str) -> None:
    with pytest.raises(WireValidationError) as ei:
        validate_modulr_org_domain(raw)
    assert ei.value.code is ErrorCode.INVALID_NAME


def test_validate_resolved_id_accepts() -> None:
    assert validate_resolved_id("  user:abc  ") == "user:abc"


def test_validate_resolved_id_rejects_empty() -> None:
    with pytest.raises(WireValidationError) as ei:
        validate_resolved_id("  ")
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID

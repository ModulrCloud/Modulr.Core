"""Phase B: protocol code constants are stable and unique."""

from modulr_core import ErrorCode, SuccessCode


def _enum_values(enum_cls: type) -> list[str]:
    return [m.value for m in enum_cls]


def test_error_code_values_unique() -> None:
    values = _enum_values(ErrorCode)
    assert len(values) == len(set(values))


def test_success_code_values_unique() -> None:
    values = _enum_values(SuccessCode)
    assert len(values) == len(set(values))


def test_error_and_success_do_not_overlap() -> None:
    errors = set(_enum_values(ErrorCode))
    successes = set(_enum_values(SuccessCode))
    assert errors.isdisjoint(successes)


def test_sample_codes_match_expected_strings() -> None:
    assert ErrorCode.MALFORMED_JSON == "MALFORMED_JSON"
    assert ErrorCode.SIGNATURE_MISSING == "SIGNATURE_MISSING"
    assert SuccessCode.MODULE_REGISTERED == "MODULE_REGISTERED"

"""Replay response cache helpers."""

from modulr_core.http.replay_cache import parse_stored_response_envelope


def test_parse_stored_response_envelope_accepts_json() -> None:
    raw = '{"status":"success","code":"MODULE_FOUND"}'
    assert parse_stored_response_envelope(raw) == {
        "status": "success",
        "code": "MODULE_FOUND",
    }


def test_parse_stored_response_envelope_rejects_placeholder() -> None:
    assert parse_stored_response_envelope("validated") is None


def test_parse_stored_response_envelope_rejects_empty() -> None:
    assert parse_stored_response_envelope(None) is None
    assert parse_stored_response_envelope("") is None

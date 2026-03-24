"""Phase C: canonical JSON and payload_hash golden vectors."""

import hashlib

import pytest

from modulr_core.validation import (
    canonical_json_bytes,
    canonical_json_str,
    payload_hash,
)


def test_key_sorting_top_level() -> None:
    assert canonical_json_str({"b": 1, "a": 2}) == '{"a":2,"b":1}'


def test_key_sorting_nested() -> None:
    assert (
        canonical_json_str({"z": {"b": 1, "a": 2}, "a": 1})
        == '{"a":1,"z":{"a":2,"b":1}}'
    )


def test_array_order_preserved() -> None:
    assert canonical_json_str({"x": [3, 1, 2]}) == '{"x":[3,1,2]}'


def test_empty_object() -> None:
    assert canonical_json_str({}) == "{}"


def test_empty_array_in_object() -> None:
    assert canonical_json_str({"k": []}) == '{"k":[]}'


def test_null_bool_int() -> None:
    assert (
        canonical_json_str({"z": None, "a": True, "m": False, "n": 0})
        == '{"a":true,"m":false,"n":0,"z":null}'
    )


def test_utf8_string_not_ascii_escaped() -> None:
    s = canonical_json_str({"msg": "€"})
    assert s == '{"msg":"€"}'
    assert canonical_json_bytes({"msg": "€"}) == s.encode("utf-8")


def test_payload_hash_empty_object_vector() -> None:
    assert payload_hash({}) == hashlib.sha256(b"{}").hexdigest()


def test_payload_hash_deterministic_vector() -> None:
    obj = {"module_name": "modulr.storage", "n": 1}
    expected = hashlib.sha256(canonical_json_bytes(obj)).hexdigest()
    assert payload_hash(obj) == expected
    assert payload_hash(obj) == payload_hash({"n": 1, "module_name": "modulr.storage"})


def test_nan_rejected() -> None:
    with pytest.raises(ValueError, match="Out of range float values"):
        canonical_json_str({"x": float("nan")})

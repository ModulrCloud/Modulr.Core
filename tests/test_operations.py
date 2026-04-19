"""Phase I: operation dispatch and handlers."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from modulr_core import (
    MODULE_VERSION,
    ErrorCode,
    SuccessCode,
    WireValidationError,
)
from modulr_core.config.schema import NetworkEnvironment, Settings
from modulr_core.messages.constants import CORE_OPERATIONS, PROTOCOL_METHOD_OPERATIONS
from modulr_core.messages.types import ValidatedInbound
from modulr_core.messages.wire_method_catalog import (
    CATALOG_SCHEMA_VERSION,
    MAX_METHOD_DESCRIPTION_LENGTH,
    build_core_module_methods_payload,
    build_protocol_methods_payload,
)
from modulr_core.operations.dispatch import dispatch_operation
from modulr_core.persistence import apply_migrations, connect_memory
from modulr_core.repositories.core_genesis import CoreGenesisRepository
from modulr_core.repositories.dial_route_entry import DialRouteEntryRepository
from modulr_core.repositories.name_bindings import NameBindingsRepository
from modulr_core.validation import envelope_signing_bytes, payload_hash


def _settings(**overrides: Any) -> Settings:
    base = Settings(
        bootstrap_public_keys=(),
        database_path=Path("x.sqlite"),
        max_http_body_bytes=2_097_152,
        max_payload_bytes=1_048_576,
        max_expiry_window_seconds=604_800,
        future_timestamp_skew_seconds=300,
        replay_window_seconds=86_400,
        dev_mode=True,
        network_environment=NetworkEnvironment.LOCAL,
        network_name="",
        cors_extra_origins=(),
    )
    return replace(base, **overrides)


def _conn() -> sqlite3.Connection:
    c = connect_memory(check_same_thread=False)
    apply_migrations(c)
    return c


def make_validated_inbound(
    pk: Ed25519PrivateKey,
    operation: str,
    payload: dict[str, Any],
    message_id: str,
) -> ValidatedInbound:
    pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    env: dict[str, Any] = {
        "protocol_version": MODULE_VERSION,
        "message_id": message_id,
        "target_module": "modulr.core",
        "operation": operation,
        "sender_id": "user:test",
        "sender_key_type": "ed25519",
        "sender_public_key": pub.hex(),
        "timestamp": 1_700_000_000.0,
        "expires_at": 1_700_000_300.0,
        "payload": payload,
        "payload_hash": payload_hash(payload),
        "signature_algorithm": "ed25519",
    }
    preimage = envelope_signing_bytes(env)
    env["signature"] = pk.sign(preimage).hex()
    signing_preimage = envelope_signing_bytes(env)
    fp = hashlib.sha256(signing_preimage).digest()
    return ValidatedInbound(
        envelope=env,
        sender_public_key=pub,
        signing_preimage=signing_preimage,
        request_fingerprint=fp,
        is_replay=False,
    )


def _register_org_with_module_payload(
    organization_name: str,
    *,
    route: dict[str, Any],
    signing_public_key_hex: str,
    module_version: str | None = None,
    resolved_id: str = "user:test-binding",
) -> dict[str, Any]:
    """register_org payload that also publishes the modules row (legacy register_module)."""
    payload: dict[str, Any] = {
        "organization_name": organization_name,
        "resolved_id": resolved_id,
        "route": route,
        "signing_public_key": signing_public_key_hex,
    }
    payload["module_version"] = MODULE_VERSION if module_version is None else module_version
    return payload


def test_lookup_builtin_modulr_core_case_insensitive() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    for name in ("modulr.core", "Modulr.Core", "MODULR.CORE"):
        lu = make_validated_inbound(
            pk,
            "lookup_module",
            {"module_name": name},
            f"m-{name}",
        )
        out = dispatch_operation(lu, settings=_settings(), conn=conn, clock=lambda: 1.0)
        assert out["code"] == str(SuccessCode.MODULE_FOUND)
        assert out["payload"]["module_name"] == "modulr.core"
        assert out["payload"]["metadata"] == {"builtin": True}
        assert out["payload"]["routes"] == []


def test_register_modulr_core_reserved() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    for name in ("modulr.core", "Modulr.Core"):
        reg = make_validated_inbound(
            pk,
            "register_org",
            _register_org_with_module_payload(
                name,
                route={},
                signing_public_key_hex=sender_pub.hex(),
            ),
            f"reg-{name}",
        )
        with pytest.raises(WireValidationError) as ei:
            dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
        assert ei.value.code is ErrorCode.MODULE_NAME_RESERVED


def test_get_protocol_methods_lists_protocol_surface() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(pk, "get_protocol_methods", {}, "gpm-1")
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.PROTOCOL_METHODS_RETURNED)
    expected = build_protocol_methods_payload()
    assert out["payload"] == expected
    names = [m["method"] for m in out["payload"]["methods"]]
    assert names == sorted(PROTOCOL_METHOD_OPERATIONS)
    for m in out["payload"]["methods"]:
        assert len(m["description"]) <= MAX_METHOD_DESCRIPTION_LENGTH


def test_get_protocol_methods_rejects_non_empty_payload() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_protocol_methods",
        {"extra": 1},
        "gpm-bad",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_get_core_genesis_branding_matches_http_snapshot() -> None:
    """Same branding dict shape as GET /genesis/branding."""
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_core_genesis_branding",
        {},
        "gcgb-1",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.CORE_GENESIS_BRANDING_RETURNED)
    assert out["operation"] == "get_core_genesis_branding_response"
    pl = out["payload"]
    assert pl["genesis_complete"] is False
    assert pl["root_organization_label"] is None
    assert pl["bootstrap_operator_display_name"] is None
    assert pl["root_organization_logo_svg"] is None
    assert pl["operator_profile_image_base64"] is None
    assert pl["operator_profile_image_mime"] is None


def test_get_organization_logo_not_found_before_genesis() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_organization_logo",
        {"organization_key": "nope"},
        "gol-1",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.IDENTITY_NOT_FOUND


def test_get_organization_logo_rejects_both_identifiers() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    pub = (
        pk.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    req = make_validated_inbound(
        pk,
        "get_organization_logo",
        {
            "organization_key": "acme",
            "organization_signing_public_key_hex": pub,
        },
        "gol-both",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_get_user_profile_image_rejects_both_identifiers() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    pub = (
        pk.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    req = make_validated_inbound(
        pk,
        "get_user_profile_image",
        {"user_handle": "alice", "user_signing_public_key_hex": pub},
        "gup-both",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_get_user_description_rejects_both_identifiers() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    pub = (
        pk.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    req = make_validated_inbound(
        pk,
        "get_user_description",
        {"user_handle": "alice", "user_signing_public_key_hex": pub},
        "gud-both",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_set_get_user_description_roundtrip() -> None:
    """After set with handle, get by pubkey must resolve the same description."""
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    pub = (
        pk.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    bio = "Builder on Modulr — one bio, many apps."
    req_set = make_validated_inbound(
        pk,
        "set_user_description",
        {
            "user_signing_public_key_hex": pub,
            "user_handle": "alice",
            "description": bio,
        },
        "sud-dual",
    )
    dispatch_operation(req_set, settings=_settings(), conn=conn, clock=lambda: 1.0)
    req_get = make_validated_inbound(
        pk,
        "get_user_description",
        {"user_signing_public_key_hex": pub},
        "gud-by-pk",
    )
    out = dispatch_operation(
        req_get,
        settings=_settings(),
        conn=conn,
        clock=lambda: 1.0,
    )
    assert out["code"] == str(SuccessCode.USER_DESCRIPTION_RETURNED)
    pl = out["payload"]
    assert pl["description"] == bio
    assert pl["source"] == "entity"


def test_get_user_description_not_found() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_user_description",
        {"user_handle": "nobody"},
        "gud-nf",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.IDENTITY_NOT_FOUND


def test_set_user_description_rejects_overlong() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    pub = (
        pk.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    req = make_validated_inbound(
        pk,
        "set_user_description",
        {
            "user_signing_public_key_hex": pub,
            "description": "x" * 2049,
        },
        "sud-long",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_set_user_profile_image_dual_key_allows_get_by_pubkey() -> None:
    """After set with handle, get by pubkey must resolve the same entity row data."""
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    pub = (
        pk.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    b64 = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg"
        "=="
    )
    req_set = make_validated_inbound(
        pk,
        "set_user_profile_image",
        {
            "user_signing_public_key_hex": pub,
            "user_handle": "alice",
            "profile_image_base64": b64,
            "profile_image_mime": "image/png",
        },
        "sup-dual",
    )
    dispatch_operation(req_set, settings=_settings(), conn=conn, clock=lambda: 1.0)
    req_get = make_validated_inbound(
        pk,
        "get_user_profile_image",
        {"user_signing_public_key_hex": pub},
        "gup-by-pk",
    )
    out = dispatch_operation(
        req_get,
        settings=_settings(),
        conn=conn,
        clock=lambda: 1.0,
    )
    assert out["code"] == str(SuccessCode.USER_PROFILE_IMAGE_RETURNED)
    pl = out["payload"]
    assert pl["profile_image_base64"] == b64
    assert pl["profile_image_mime"] == "image/png"


def test_set_organization_logo_rejects_org_key_not_bound_to_claimed_pubkey() -> None:
    """Non-bootstrap cannot set k:<name> unless name_bindings ties name to org_pk."""
    alice = Ed25519PrivateKey.generate()
    bob = Ed25519PrivateKey.generate()
    alice_pub = (
        alice.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    bob_pub = (
        bob.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    conn = _conn()
    NameBindingsRepository(conn).insert(
        name="myorg",
        resolved_id=alice_pub,
        route_json=None,
        metadata_json=None,
        created_at=1,
    )
    svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
    req = make_validated_inbound(
        bob,
        "set_organization_logo",
        {
            "organization_signing_public_key_hex": bob_pub,
            "organization_key": "myorg",
            "logo_svg": svg,
        },
        "sol-mismatch",
    )
    # With empty bootstrap + dev_mode, every sender is treated as bootstrap and the
    # name-binding check is skipped. Restrict bootstrap to another key so Bob is not.
    settings = replace(
        _settings(),
        dev_mode=False,
        bootstrap_public_keys=(alice_pub,),
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=settings, conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.IDENTITY_MISMATCH


def test_get_user_profile_image_not_found_before_genesis() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_user_profile_image",
        {"user_handle": "nobody"},
        "gup-1",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.IDENTITY_NOT_FOUND


def test_get_core_genesis_branding_rejects_non_empty_payload() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_core_genesis_branding",
        {"x": 1},
        "gcgb-bad",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_get_module_methods_core_lists_wire_operations() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_module_methods",
        {"module_id": "modulr.core"},
        "gmm-1",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.MODULE_METHODS_RETURNED)
    assert out["payload"] == build_core_module_methods_payload(module_id="modulr.core")
    names = [m["method"] for m in out["payload"]["methods"]]
    assert names == sorted(CORE_OPERATIONS)
    for m in out["payload"]["methods"]:
        assert len(m["description"]) <= MAX_METHOD_DESCRIPTION_LENGTH


def test_get_module_methods_core_case_insensitive() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_module_methods",
        {"module_id": "Modulr.Core"},
        "gmm-2",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.MODULE_METHODS_RETURNED)
    assert out["payload"]["module_id"] == "modulr.core"


def test_get_module_methods_unknown_module() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_module_methods",
        {"module_id": "modulr.unknown"},
        "gmm-3",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.MODULE_NOT_FOUND


def test_get_module_methods_registered_module_empty_manifest() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={"base_url": "https://s.example"},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "gmm-reg",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    req = make_validated_inbound(
        pk,
        "get_module_methods",
        {"module_id": "modulr.storage"},
        "gmm-4",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.MODULE_METHODS_RETURNED)
    assert out["payload"]["catalog_schema_version"] == CATALOG_SCHEMA_VERSION
    assert out["payload"]["methods"] == []
    assert out["payload"]["method_count"] == 0


def test_get_module_route_modulr_core_default() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.core"},
        "gmr-core-0",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.MODULE_ROUTE_RETURNED)
    assert out["payload"]["module_id"] == "modulr.core"
    assert out["payload"]["route_detail"] == {
        "kind": "modulr.core",
        "note": "Built-in coordination plane; not stored in modules table.",
    }
    assert "route_type" not in out["payload"]
    assert out["payload"]["routes"] == []


def test_get_module_route_modulr_core_after_submit() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    submit = make_validated_inbound(
        pk,
        "submit_module_route",
        {
            "module_id": "Modulr.Core",
            "route_type": "ip",
            "route": "127.0.0.1:8000",
        },
        "gmr-core-sub",
    )
    dispatch_operation(submit, settings=_settings(), conn=conn, clock=lambda: 1.0)
    req = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.core"},
        "gmr-core-1",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert out["code"] == str(SuccessCode.MODULE_ROUTE_RETURNED)
    assert out["payload"]["module_id"] == "modulr.core"
    assert out["payload"]["route_detail"] == {
        "route_type": "ip",
        "route": "127.0.0.1:8000",
    }
    assert out["payload"]["route_type"] == "ip"
    assert out["payload"]["route"] == "127.0.0.1:8000"
    assert len(out["payload"]["routes"]) == 1
    assert out["payload"]["routes"][0]["route_type"] == "ip"
    assert out["payload"]["routes"][0]["route"] == "127.0.0.1:8000"
    assert out["payload"]["routes"][0]["priority"] == 0


def test_get_module_route_registered_module() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={"base_url": "https://s.example"},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "gmr-reg",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    req = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "Modulr.Storage"},
        "gmr-1",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert out["code"] == str(SuccessCode.MODULE_ROUTE_RETURNED)
    assert out["payload"]["module_id"] == "modulr.storage"
    assert out["payload"]["route_detail"] == {"base_url": "https://s.example"}
    assert "route_type" not in out["payload"]
    assert out["payload"]["routes"] == []


def test_get_module_route_matches_lookup_after_submit() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={"base_url": "https://old.example"},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "gmr-lu-reg",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    submit = make_validated_inbound(
        pk,
        "submit_module_route",
        {
            "module_id": "modulr.storage",
            "route_type": "ip",
            "route": "203.0.113.10:8443",
        },
        "gmr-lu-sub",
    )
    dispatch_operation(submit, settings=_settings(), conn=conn, clock=lambda: 2.0)
    req = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.storage"},
        "gmr-lu",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 3.0)
    assert out["code"] == str(SuccessCode.MODULE_ROUTE_RETURNED)
    assert out["payload"]["route_detail"] == {
        "route_type": "ip",
        "route": "203.0.113.10:8443",
    }
    assert out["payload"]["route_type"] == "ip"
    assert out["payload"]["route"] == "203.0.113.10:8443"
    assert len(out["payload"]["routes"]) == 1
    lu = make_validated_inbound(
        pk,
        "lookup_module",
        {"module_name": "modulr.storage"},
        "gmr-lu-lookup",
    )
    looked = dispatch_operation(lu, settings=_settings(), conn=conn, clock=lambda: 4.0)
    assert looked["payload"]["route"] == out["payload"]["route_detail"]
    assert looked["payload"]["routes"] == out["payload"]["routes"]


def test_get_module_route_modulr_core_multiple_dials_ordered() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    dials = DialRouteEntryRepository(conn)
    dials.upsert_merge(
        scope="modulr.core",
        route_type="ip",
        route="10.0.0.1:1",
        priority=10,
        endpoint_signing_public_key_hex=None,
        now=100,
    )
    dials.upsert_merge(
        scope="modulr.core",
        route_type="ip",
        route="10.0.0.2:2",
        priority=5,
        endpoint_signing_public_key_hex=None,
        now=100,
    )
    conn.commit()
    req = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.core"},
        "gmr-multi",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.MODULE_ROUTE_RETURNED)
    routes = out["payload"]["routes"]
    assert [r["route"] for r in routes] == ["10.0.0.2:2", "10.0.0.1:1"]
    assert out["payload"]["route_detail"] == {
        "route_type": "ip",
        "route": "10.0.0.2:2",
    }


def test_get_module_route_unknown_returns_not_found() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.unknown"},
        "gmr-404",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.MODULE_NOT_FOUND


def test_lookup_module_case_insensitive_after_register() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "Modulr.Playground",
            route={"base_url": "https://p.example"},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "m1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    lu = make_validated_inbound(
        pk,
        "lookup_module",
        {"module_name": "modulr.playground"},
        "m2",
    )
    out = dispatch_operation(lu, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.MODULE_FOUND)
    assert out["payload"]["module_name"] == "modulr.playground"
    assert out["payload"]["routes"] == []


def test_register_and_lookup_module() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={"base_url": "https://s.example"},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "m1",
    )
    out1 = dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out1["status"] == "success"
    assert out1["code"] == str(SuccessCode.ORG_REGISTERED)
    assert out1["payload"]["module_registered"] is True
    lu = make_validated_inbound(
        pk,
        "lookup_module",
        {"module_name": "modulr.storage"},
        "m2",
    )
    out2 = dispatch_operation(lu, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out2["code"] == str(SuccessCode.MODULE_FOUND)
    assert out2["payload"]["module_name"] == "modulr.storage"
    assert out2["payload"]["routes"] == []


def test_submit_module_route_second_submit_replaces_dial_row_not_appends() -> None:
    """Changing endpoint must not leave the old (scope, route_type, route) row first."""
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={"base_url": "https://old.example"},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "smr2-reg",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.storage",
                "route_type": "ip",
                "route": "203.0.113.1:1",
                "mode": "replace_all",
            },
            "smr2-a",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 2.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.storage",
                "route_type": "ip",
                "route": "203.0.113.2:2",
                "mode": "replace_all",
            },
            "smr2-b",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 3.0,
    )
    gmr = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.storage"},
        "smr2-gmr",
    )
    out = dispatch_operation(gmr, settings=_settings(), conn=conn, clock=lambda: 4.0)
    assert len(out["payload"]["routes"]) == 1
    assert out["payload"]["routes"][0]["route"] == "203.0.113.2:2"
    assert out["payload"]["route"] == "203.0.113.2:2"


def test_submit_module_route_updates_module_route() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={"base_url": "https://old.example"},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "smr-reg",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    submit = make_validated_inbound(
        pk,
        "submit_module_route",
        {
            "module_id": "Modulr.Storage",
            "route_type": "ip",
            "route": "203.0.113.10:8443",
        },
        "smr-1",
    )
    out = dispatch_operation(submit, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert out["code"] == str(SuccessCode.MODULE_ROUTE_SUBMITTED)
    assert out["payload"]["module_id"] == "modulr.storage"
    assert out["payload"]["mode"] == "replace_all"
    assert out["payload"]["priority"] == 0
    lu = make_validated_inbound(
        pk,
        "lookup_module",
        {"module_name": "modulr.storage"},
        "smr-lu",
    )
    looked = dispatch_operation(lu, settings=_settings(), conn=conn, clock=lambda: 3.0)
    assert looked["payload"]["route"] == {
        "route_type": "ip",
        "route": "203.0.113.10:8443",
    }
    assert len(looked["payload"]["routes"]) == 1


def test_submit_module_route_merge_stacks_two_dials() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "register_org",
            _register_org_with_module_payload(
                "modulr.storage",
                route={"base_url": "https://old.example"},
                signing_public_key_hex=sender_pub.hex(),
            ),
            "sm3-reg",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 1.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.storage",
                "route_type": "ip",
                "route": "198.51.100.1:1",
            },
            "sm3-a",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 2.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.storage",
                "route_type": "ip",
                "route": "198.51.100.2:2",
                "mode": "merge",
            },
            "sm3-b",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 3.0,
    )
    gmr = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.storage"},
        "sm3-gmr",
    )
    out = dispatch_operation(gmr, settings=_settings(), conn=conn, clock=lambda: 4.0)
    assert len(out["payload"]["routes"]) == 2
    assert {r["route"] for r in out["payload"]["routes"]} == {
        "198.51.100.1:1",
        "198.51.100.2:2",
    }


def test_submit_module_route_replace_all_after_merge_leaves_one_dial() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "register_org",
            _register_org_with_module_payload(
                "modulr.storage",
                route={"base_url": "https://old.example"},
                signing_public_key_hex=sender_pub.hex(),
            ),
            "sm4-reg",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 1.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.storage",
                "route_type": "ip",
                "route": "198.51.100.1:1",
            },
            "sm4-a",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 2.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.storage",
                "route_type": "ip",
                "route": "198.51.100.2:2",
                "mode": "merge",
            },
            "sm4-b",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 3.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.storage",
                "route_type": "ip",
                "route": "203.0.113.99:9999",
                "mode": "replace_all",
            },
            "sm4-c",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 4.0,
    )
    gmr = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.storage"},
        "sm4-gmr",
    )
    out = dispatch_operation(gmr, settings=_settings(), conn=conn, clock=lambda: 5.0)
    assert len(out["payload"]["routes"]) == 1
    assert out["payload"]["routes"][0]["route"] == "203.0.113.99:9999"


def test_submit_module_route_invalid_mode() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    submit = make_validated_inbound(
        pk,
        "submit_module_route",
        {
            "module_id": "modulr.core",
            "route_type": "ip",
            "route": "127.0.0.1:1",
            "mode": "wipe",
        },
        "sm5",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(submit, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_submit_module_route_core_merge_rejected_without_bootstrap() -> None:
    pk = Ed25519PrivateKey.generate()
    other = Ed25519PrivateKey.generate()
    conn = _conn()
    other_hex = (
        other.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    settings = _settings(dev_mode=False, bootstrap_public_keys=(other_hex,))
    submit = make_validated_inbound(
        pk,
        "submit_module_route",
        {
            "module_id": "modulr.core",
            "route_type": "ip",
            "route": "127.0.0.1:1",
            "mode": "merge",
        },
        "sm-core-merge-denied",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(submit, settings=settings, conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.UNAUTHORIZED


def test_core_route_merge_allows_genesis_operator_not_in_toml() -> None:
    """Genesis operator may merge core dials without duplicating the key in TOML."""
    pk = Ed25519PrivateKey.generate()
    other = Ed25519PrivateKey.generate()
    conn = _conn()
    other_hex = (
        other.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    sender_hex = (
        pk.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    grepo = CoreGenesisRepository(conn)
    grepo.set_bootstrap_signing_pubkey_hex(pubkey_hex=sender_hex, updated_at=1)
    grepo.set_genesis_complete(complete=True, updated_at=1)
    conn.commit()
    settings = _settings(dev_mode=False, bootstrap_public_keys=(other_hex,))
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.core",
                "route_type": "ip",
                "route": "127.0.0.1:1",
                "mode": "merge",
            },
            "sm-core-genesis-merge",
        ),
        settings=settings,
        conn=conn,
        clock=lambda: 1.0,
    )


def test_submit_module_route_core_merge_allowed_for_bootstrap_sender() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_hex = (
        pk.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    settings = _settings(dev_mode=False, bootstrap_public_keys=(sender_hex,))
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.core",
                "route_type": "ip",
                "route": "127.0.0.1:1",
            },
            "sm-core-m1",
        ),
        settings=settings,
        conn=conn,
        clock=lambda: 1.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.core",
                "route_type": "ip",
                "route": "127.0.0.1:2",
                "mode": "merge",
            },
            "sm-core-m2",
        ),
        settings=settings,
        conn=conn,
        clock=lambda: 2.0,
    )
    gmr = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.core"},
        "sm-core-gmr",
    )
    out = dispatch_operation(gmr, settings=settings, conn=conn, clock=lambda: 3.0)
    assert len(out["payload"]["routes"]) == 2
    routes = {r["route"] for r in out["payload"]["routes"]}
    assert routes == {"127.0.0.1:1", "127.0.0.1:2"}


def test_remove_module_route_registered_module() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "register_org",
            _register_org_with_module_payload(
                "modulr.storage",
                route={"base_url": "https://old.example"},
                signing_public_key_hex=sender_pub.hex(),
            ),
            "rmr-reg",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 1.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.storage",
                "route_type": "ip",
                "route": "198.51.100.10:443",
            },
            "rmr-sub",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 2.0,
    )
    rem = make_validated_inbound(
        pk,
        "remove_module_route",
        {
            "module_id": "modulr.storage",
            "route_type": "ip",
            "route": "198.51.100.10:443",
        },
        "rmr-del",
    )
    out = dispatch_operation(rem, settings=_settings(), conn=conn, clock=lambda: 3.0)
    assert out["code"] == str(SuccessCode.MODULE_ROUTE_REMOVED)
    assert out["payload"]["module_id"] == "modulr.storage"
    gmr = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.storage"},
        "rmr-gmr",
    )
    gout = dispatch_operation(gmr, settings=_settings(), conn=conn, clock=lambda: 4.0)
    assert gout["payload"]["routes"] == []
    assert gout["payload"]["route_detail"] == {}


def test_remove_module_route_dial_not_found() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "register_org",
            _register_org_with_module_payload(
                "modulr.storage",
                route={"base_url": "https://old.example"},
                signing_public_key_hex=sender_pub.hex(),
            ),
            "rmr2-reg",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 1.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.storage",
                "route_type": "ip",
                "route": "198.51.100.1:1",
            },
            "rmr2-sub",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 2.0,
    )
    rem = make_validated_inbound(
        pk,
        "remove_module_route",
        {
            "module_id": "modulr.storage",
            "route_type": "ip",
            "route": "198.51.100.99:99",
        },
        "rmr2-bad",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(rem, settings=_settings(), conn=conn, clock=lambda: 3.0)
    assert ei.value.code is ErrorCode.DIAL_NOT_FOUND


def test_remove_module_route_core_rejected_without_bootstrap() -> None:
    pk = Ed25519PrivateKey.generate()
    other = Ed25519PrivateKey.generate()
    conn = _conn()
    other_hex = (
        other.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    settings = _settings(dev_mode=False, bootstrap_public_keys=(other_hex,))
    dispatch_operation(
        make_validated_inbound(
            other,
            "submit_module_route",
            {
                "module_id": "modulr.core",
                "route_type": "ip",
                "route": "127.0.0.1:55",
            },
            "rmr-core-seed",
        ),
        settings=settings,
        conn=conn,
        clock=lambda: 0.5,
    )
    rem = make_validated_inbound(
        pk,
        "remove_module_route",
        {
            "module_id": "modulr.core",
            "route_type": "ip",
            "route": "127.0.0.1:55",
        },
        "rmr-core-denied",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(rem, settings=settings, conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.UNAUTHORIZED


def test_remove_module_route_core_clears_advertised_when_last_removed() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.core",
                "route_type": "ip",
                "route": "127.0.0.1:7000",
            },
            "rmr-core-sub",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 1.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "remove_module_route",
            {
                "module_id": "modulr.core",
                "route_type": "ip",
                "route": "127.0.0.1:7000",
            },
            "rmr-core-rem",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 2.0,
    )
    gmr = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.core"},
        "rmr-core-gmr",
    )
    out = dispatch_operation(gmr, settings=_settings(), conn=conn, clock=lambda: 3.0)
    assert out["payload"]["routes"] == []
    assert out["payload"]["route_detail"]["kind"] == "modulr.core"


def test_remove_module_route_identity_mismatch() -> None:
    pk = Ed25519PrivateKey.generate()
    other = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "register_org",
            _register_org_with_module_payload(
                "modulr.storage",
                route={"base_url": "https://old.example"},
                signing_public_key_hex=sender_pub.hex(),
            ),
            "rmr3-reg",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 1.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.storage",
                "route_type": "ip",
                "route": "198.51.100.3:3",
            },
            "rmr3-sub",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 2.0,
    )
    rem = make_validated_inbound(
        other,
        "remove_module_route",
        {
            "module_id": "modulr.storage",
            "route_type": "ip",
            "route": "198.51.100.3:3",
        },
        "rmr3-bad",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(rem, settings=_settings(), conn=conn, clock=lambda: 3.0)
    assert ei.value.code is ErrorCode.IDENTITY_MISMATCH


def test_submit_module_route_invalid_endpoint_pubkey() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    submit = make_validated_inbound(
        pk,
        "submit_module_route",
        {
            "module_id": "modulr.core",
            "route_type": "ip",
            "route": "127.0.0.1:1",
            "endpoint_signing_public_key_hex": "g" * 64,
        },
        "sm6",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(submit, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.PUBLIC_KEY_INVALID


def test_submit_module_route_endpoint_pubkey_stored_on_dial() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    epk = (
        Ed25519PrivateKey.generate()
        .public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    submit = make_validated_inbound(
        pk,
        "submit_module_route",
        {
            "module_id": "modulr.core",
            "route_type": "ip",
            "route": "127.0.0.1:9000",
            "endpoint_signing_public_key_hex": epk,
        },
        "sm8",
    )
    dispatch_operation(submit, settings=_settings(), conn=conn, clock=lambda: 1.0)
    gmr = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.core"},
        "sm8-gmr",
    )
    out = dispatch_operation(gmr, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert out["payload"]["routes"][0]["endpoint_signing_public_key_hex"] == epk


def test_submit_module_route_merge_priority_orders_primary() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "register_org",
            _register_org_with_module_payload(
                "modulr.storage",
                route={"base_url": "https://old.example"},
                signing_public_key_hex=sender_pub.hex(),
            ),
            "sm7-reg",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 1.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.storage",
                "route_type": "ip",
                "route": "198.51.100.10:10",
                "priority": 10,
            },
            "sm7-a",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 2.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "submit_module_route",
            {
                "module_id": "modulr.storage",
                "route_type": "ip",
                "route": "198.51.100.5:5",
                "priority": 5,
                "mode": "merge",
            },
            "sm7-b",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 3.0,
    )
    gmr = make_validated_inbound(
        pk,
        "get_module_route",
        {"module_id": "modulr.storage"},
        "sm7-gmr",
    )
    out = dispatch_operation(gmr, settings=_settings(), conn=conn, clock=lambda: 4.0)
    assert out["payload"]["routes"][0]["route"] == "198.51.100.5:5"
    assert out["payload"]["route"] == "198.51.100.5:5"


def test_submit_module_route_builtin_modulr_core() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    submit = make_validated_inbound(
        pk,
        "submit_module_route",
        {
            "module_id": "Modulr.Core",
            "route_type": "ip",
            "route": "127.0.0.1:8000",
        },
        "smr-core-1",
    )
    out = dispatch_operation(submit, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.MODULE_ROUTE_SUBMITTED)
    assert out["payload"]["module_id"] == "modulr.core"
    assert out["payload"]["route_type"] == "ip"
    assert out["payload"]["route"] == "127.0.0.1:8000"
    assert out["payload"]["mode"] == "replace_all"
    assert out["payload"]["priority"] == 0
    lu = make_validated_inbound(
        pk,
        "lookup_module",
        {"module_name": "modulr.core"},
        "smr-core-lu",
    )
    looked = dispatch_operation(lu, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert looked["payload"]["route"] == {
        "route_type": "ip",
        "route": "127.0.0.1:8000",
    }
    assert len(looked["payload"]["routes"]) == 1


def test_submit_module_route_unknown_module() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    submit = make_validated_inbound(
        pk,
        "submit_module_route",
        {
            "module_id": "modulr.unknown",
            "route_type": "ip",
            "route": "203.0.113.10:8443",
        },
        "smr-404",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(submit, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.MODULE_NOT_FOUND


def test_submit_module_route_identity_mismatch() -> None:
    pk = Ed25519PrivateKey.generate()
    other = Ed25519PrivateKey.generate()
    conn = _conn()
    other_pub = other.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={"base_url": "https://old.example"},
            signing_public_key_hex=other_pub.hex(),
        ),
        "smr-id-reg",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    submit = make_validated_inbound(
        pk,
        "submit_module_route",
        {
            "module_id": "modulr.storage",
            "route_type": "ip",
            "route": "203.0.113.10:8443",
        },
        "smr-id-1",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(submit, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert ei.value.code is ErrorCode.IDENTITY_MISMATCH


def test_register_requires_bootstrap_when_configured() -> None:
    pk = Ed25519PrivateKey.generate()
    other = Ed25519PrivateKey.generate()
    allowed = (
        other.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    conn = _conn()
    mod_key = (
        Ed25519PrivateKey.generate()
        .public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.x",
            route={},
            signing_public_key_hex=mod_key.hex(),
        ),
        "m1",
    )
    with pytest.raises(WireValidationError, match="bootstrap"):
        dispatch_operation(
            reg,
            settings=_settings(
                bootstrap_public_keys=(allowed,),
                dev_mode=False,
            ),
            conn=conn,
            clock=lambda: 1.0,
        )


def test_resolve_name_found() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    NameBindingsRepository(conn).insert(
        name="chris@modulr.network",
        resolved_id="user:abc",
        route_json=json.dumps({"x": 1}),
        metadata_json=None,
        created_at=1,
    )
    conn.commit()
    v = make_validated_inbound(
        pk,
        "resolve_name",
        {"name": "chris@modulr.network"},
        "m1",
    )
    out = dispatch_operation(v, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.NAME_RESOLVED)
    assert out["payload"]["resolved_id"] == "user:abc"


def test_heartbeat_requires_module() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    hb = make_validated_inbound(
        pk,
        "heartbeat_update",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "status": "healthy",
        },
        "m1",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(hb, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.MODULE_NOT_FOUND


def test_heartbeat_after_register() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "m1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    hb = make_validated_inbound(
        pk,
        "heartbeat_update",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "status": "healthy",
            "last_seen_at": 99,
        },
        "m2",
    )
    out = dispatch_operation(hb, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.HEARTBEAT_RECORDED)


def test_heartbeat_identity_mismatch() -> None:
    pk = Ed25519PrivateKey.generate()
    other = Ed25519PrivateKey.generate()
    conn = _conn()
    other_pub = other.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={},
            signing_public_key_hex=other_pub.hex(),
        ),
        "m1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    hb = make_validated_inbound(
        pk,
        "heartbeat_update",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "status": "healthy",
        },
        "m2",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(hb, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.IDENTITY_MISMATCH


def test_get_module_state_modulr_core_empty() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_module_state",
        {"module_id": "modulr.core"},
        "gms-core",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.MODULE_STATE_SNAPSHOT_RETURNED)
    assert out["payload"]["module_id"] == "modulr.core"
    assert out["payload"]["state_phase"] is None
    assert out["payload"]["detail"] is None
    assert out["payload"]["reported_at"] is None


def test_get_module_state_unknown_module() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_module_state",
        {"module_id": "modulr.unknown"},
        "gms-x",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.MODULE_NOT_FOUND


def _valid_report_module_state_detail(*, notes: str | None = None) -> str:
    obj: dict[str, Any] = {
        "schema_version": 2,
        "metrics": {
            "total_users": 100,
            "active_users": 42,
            "subscribers": 80,
            "validators": 5,
            "providers": 12,
            "active_jobs": 3,
        },
        "validator_status_pct": {"active": 55, "passive": 30, "offline": 15},
        "health_activity_24h": {
            "granularity_hours": 1,
            "jobs_points": [0.99] * 24,
            "aux1_label": "Errors",
            "aux1_points": [0.01] * 24,
            "aux2_label": "Latency",
            "aux2_points": [12.0] * 24,
        },
        "dashboard_cards": [
            {"title": "Smoke card", "value": 1, "description": "Minimal valid card."},
        ],
        "dashboard_pies": [],
    }
    if notes is not None:
        obj["notes"] = notes
    return json.dumps(obj, separators=(",", ":"), sort_keys=True)


def test_report_module_state_requires_registration() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "report_module_state",
        {
            "module_id": "modulr.storage",
            "state_phase": "running",
            "detail": _valid_report_module_state_detail(),
        },
        "rms-1",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.MODULE_NOT_FOUND


def test_report_module_state_invalid_phase() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "rms-reg",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    bad = make_validated_inbound(
        pk,
        "report_module_state",
        {
            "module_id": "modulr.storage",
            "state_phase": "exploding",
            "detail": _valid_report_module_state_detail(),
        },
        "rms-bad",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(bad, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert ei.value.code is ErrorCode.INVALID_STATUS


def test_report_module_state_then_get() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "rms-r1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    expected_detail = _valid_report_module_state_detail(notes="disk slow")
    rep = make_validated_inbound(
        pk,
        "report_module_state",
        {
            "module_id": "modulr.storage",
            "state_phase": "degraded",
            "detail": expected_detail,
        },
        "rms-r2",
    )
    out_rep = dispatch_operation(
        rep,
        settings=_settings(),
        conn=conn,
        clock=lambda: 77.0,
    )
    assert out_rep["code"] == str(SuccessCode.MODULE_STATE_REPORTED)
    assert out_rep["payload"]["state_phase"] == "degraded"
    assert out_rep["payload"]["detail"] == expected_detail
    assert out_rep["payload"]["reported_at"] == 77

    any_pk = Ed25519PrivateKey.generate()
    get = make_validated_inbound(
        any_pk,
        "get_module_state",
        {"module_id": "modulr.storage"},
        "rms-g1",
    )
    out_get = dispatch_operation(
        get,
        settings=_settings(),
        conn=conn,
        clock=lambda: 88.0,
    )
    assert out_get["code"] == str(SuccessCode.MODULE_STATE_SNAPSHOT_RETURNED)
    assert out_get["payload"]["module_id"] == "modulr.storage"
    assert out_get["payload"]["state_phase"] == "degraded"
    assert out_get["payload"]["detail"] == expected_detail
    assert out_get["payload"]["reported_at"] == 77


def test_report_module_state_detail_required() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "rms-dr1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    req = make_validated_inbound(
        pk,
        "report_module_state",
        {"module_id": "modulr.storage", "state_phase": "running"},
        "rms-dr2",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_report_module_state_detail_invalid_validator_pct_sum() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "rms-dv1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    bad_detail = json.dumps(
        {
            "schema_version": 2,
            "metrics": {
                "total_users": 1,
                "active_users": 1,
                "subscribers": 1,
                "validators": 1,
                "providers": 1,
                "active_jobs": 1,
            },
            "validator_status_pct": {"active": 10, "passive": 10, "offline": 10},
            "health_activity_24h": {
                "granularity_hours": 1,
                "jobs_points": [1.0] * 24,
                "aux1_label": "A",
                "aux1_points": [0.0] * 24,
                "aux2_label": "B",
                "aux2_points": [0.0] * 24,
            },
            "dashboard_cards": [
                {"title": "x", "value": 1, "description": "y"},
            ],
            "dashboard_pies": [],
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    req = make_validated_inbound(
        pk,
        "report_module_state",
        {
            "module_id": "modulr.storage",
            "state_phase": "running",
            "detail": bad_detail,
        },
        "rms-dv2",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_report_module_state_rejects_boolean_schema_version() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "rms-bool1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    bad = json.loads(_valid_report_module_state_detail())
    bad["schema_version"] = True
    detail = json.dumps(bad, separators=(",", ":"), sort_keys=True)
    req = make_validated_inbound(
        pk,
        "report_module_state",
        {
            "module_id": "modulr.storage",
            "state_phase": "running",
            "detail": detail,
        },
        "rms-bool2",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_report_module_state_rejects_non_finite_health_point() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "rms-inf1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    bad = json.loads(_valid_report_module_state_detail())
    jp = list(bad["health_activity_24h"]["jobs_points"])
    jp[0] = float("inf")
    bad["health_activity_24h"] = {**bad["health_activity_24h"], "jobs_points": jp}
    detail = json.dumps(bad, separators=(",", ":"), sort_keys=True)
    req = make_validated_inbound(
        pk,
        "report_module_state",
        {
            "module_id": "modulr.storage",
            "state_phase": "running",
            "detail": detail,
        },
        "rms-inf2",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_report_module_state_rejects_negative_jobs_point() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "rms-neg1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    bad = json.loads(_valid_report_module_state_detail())
    jp = list(bad["health_activity_24h"]["jobs_points"])
    jp[0] = -1.0
    bad["health_activity_24h"] = {**bad["health_activity_24h"], "jobs_points": jp}
    detail = json.dumps(bad, separators=(",", ":"), sort_keys=True)
    req = make_validated_inbound(
        pk,
        "report_module_state",
        {
            "module_id": "modulr.storage",
            "state_phase": "running",
            "detail": detail,
        },
        "rms-neg2",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_report_module_state_rejects_health_point_int_overflow_to_float() -> None:
    """Huge JSON integers must not become float(OverflowError) → 500."""
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "rms-of1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    bad = json.loads(_valid_report_module_state_detail())
    jp = list(bad["health_activity_24h"]["jobs_points"])
    jp[0] = 10**400
    bad["health_activity_24h"] = {**bad["health_activity_24h"], "jobs_points": jp}
    detail = json.dumps(bad, separators=(",", ":"), sort_keys=True)
    req = make_validated_inbound(
        pk,
        "report_module_state",
        {
            "module_id": "modulr.storage",
            "state_phase": "running",
            "detail": detail,
        },
        "rms-of2",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_report_module_state_strips_unknown_health_keys_with_warning() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "rms-warn1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    obj = json.loads(_valid_report_module_state_detail())
    obj["health_activity_24h"]["legacy_points"] = [0.5] * 24
    detail = json.dumps(obj, separators=(",", ":"), sort_keys=True)
    req = make_validated_inbound(
        pk,
        "report_module_state",
        {
            "module_id": "modulr.storage",
            "state_phase": "running",
            "detail": detail,
        },
        "rms-warn2",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert out["code"] == str(SuccessCode.MODULE_STATE_REPORTED)
    warns = out["payload"].get("warnings")
    assert isinstance(warns, list)
    assert any("legacy_points" in w for w in warns)
    stored = json.loads(out["payload"]["detail"])
    assert "legacy_points" not in stored["health_activity_24h"]


def test_report_module_state_rejects_schema_version_1_detail() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_org",
        _register_org_with_module_payload(
            "modulr.storage",
            route={},
            signing_public_key_hex=sender_pub.hex(),
        ),
        "rms-v1-1",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    legacy = json.dumps(
        {
            "schema_version": 1,
            "metrics": {
                "total_users": 1,
                "active_users": 1,
                "subscribers": 1,
                "validators": 1,
                "providers": 1,
                "active_jobs": 1,
            },
            "validator_status_pct": {"active": 34, "passive": 33, "offline": 33},
            "health_activity_24h": {"granularity_hours": 1, "points": [1.0] * 24},
            "dashboard_cards": [
                {"title": "x", "value": 1, "description": "y"},
            ],
            "dashboard_pies": [],
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    req = make_validated_inbound(
        pk,
        "report_module_state",
        {
            "module_id": "modulr.storage",
            "state_phase": "running",
            "detail": legacy,
        },
        "rms-v1-2",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 2.0)
    assert ei.value.code is ErrorCode.PAYLOAD_INVALID


def test_register_name_resolve_and_reverse() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    reg = make_validated_inbound(
        pk,
        "register_name",
        {
            "name": "user@modulr.network",
            "resolved_id": "user:alice",
            "route": {"web": "https://example"},
        },
        "m-reg",
    )
    out = dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 10.0)
    assert out["code"] == str(SuccessCode.NAME_REGISTERED)
    assert out["payload"]["resolved_id"] == "user:alice"

    v_res = make_validated_inbound(
        pk,
        "resolve_name",
        {"name": "user@modulr.network"},
        "m-res",
    )
    out_res = dispatch_operation(
        v_res,
        settings=_settings(),
        conn=conn,
        clock=lambda: 11.0,
    )
    assert out_res["payload"]["resolved_id"] == "user:alice"

    v_rev = make_validated_inbound(
        pk,
        "reverse_resolve_name",
        {"resolved_id": "user:alice"},
        "m-rev",
    )
    out_rev = dispatch_operation(
        v_rev,
        settings=_settings(),
        conn=conn,
        clock=lambda: 12.0,
    )
    assert out_rev["code"] == str(SuccessCode.NAME_REVERSE_RESOLVED)
    assert len(out_rev["payload"]["names"]) == 1
    assert out_rev["payload"]["names"][0]["name"] == "user@modulr.network"


def test_register_org_and_reverse_lists_both() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    dispatch_operation(
        make_validated_inbound(
            pk,
            "register_org",
            {
                "organization_name": "acme.network",
                "resolved_id": "org:1",
            },
            "o1",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 1.0,
    )
    dispatch_operation(
        make_validated_inbound(
            pk,
            "register_name",
            {
                "name": "bob@acme.network",
                "resolved_id": "org:1",
            },
            "n1",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 2.0,
    )
    out = dispatch_operation(
        make_validated_inbound(
            pk,
            "reverse_resolve_name",
            {"resolved_id": "org:1"},
            "r1",
        ),
        settings=_settings(),
        conn=conn,
        clock=lambda: 3.0,
    )
    names = {e["name"] for e in out["payload"]["names"]}
    assert names == {"acme.network", "bob@acme.network"}


def test_reverse_resolve_identity_not_found() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(
            make_validated_inbound(
                pk,
                "reverse_resolve_name",
                {"resolved_id": "user:missing"},
                "m1",
            ),
            settings=_settings(),
            conn=conn,
            clock=lambda: 1.0,
        )
    assert ei.value.code is ErrorCode.IDENTITY_NOT_FOUND


def test_register_name_conflict() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    NameBindingsRepository(conn).insert(
        name="user@modulr.network",
        resolved_id="user:other",
        route_json=None,
        metadata_json=None,
        created_at=1,
    )
    conn.commit()
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(
            make_validated_inbound(
                pk,
                "register_name",
                {
                    "name": "user@modulr.network",
                    "resolved_id": "user:alice",
                },
                "m1",
            ),
            settings=_settings(),
            conn=conn,
            clock=lambda: 1.0,
        )
    assert ei.value.code is ErrorCode.NAME_ALREADY_BOUND


def test_register_name_requires_bootstrap_when_configured() -> None:
    allowed = Ed25519PrivateKey.generate()
    signer = Ed25519PrivateKey.generate()
    allowed_hex = (
        allowed.public_key()
        .public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
        )
        .hex()
    )
    conn = _conn()
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(
            make_validated_inbound(
                signer,
                "register_name",
                {
                    "name": "@alice",
                    "resolved_id": "user:a",
                },
                "m1",
            ),
            settings=_settings(
                bootstrap_public_keys=(allowed_hex,),
                dev_mode=False,
            ),
            conn=conn,
            clock=lambda: 1.0,
        )
    assert ei.value.code is ErrorCode.UNAUTHORIZED

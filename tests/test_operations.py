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
from modulr_core.config.schema import Settings
from modulr_core.messages.constants import CORE_OPERATIONS
from modulr_core.messages.types import ValidatedInbound
from modulr_core.operations.dispatch import dispatch_operation
from modulr_core.persistence import apply_migrations, connect_memory
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
            "register_module",
            {
                "module_name": name,
                "module_version": MODULE_VERSION,
                "route": {},
                "signing_public_key": sender_pub.hex(),
            },
            f"reg-{name}",
        )
        with pytest.raises(WireValidationError) as ei:
            dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
        assert ei.value.code is ErrorCode.MODULE_NAME_RESERVED


def test_get_module_functions_core_lists_wire_operations() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_module_functions",
        {"module_id": "modulr.core"},
        "gmf-1",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.MODULE_FUNCTIONS_RETURNED)
    assert out["payload"]["module_id"] == "modulr.core"
    assert out["payload"]["operations"] == sorted(CORE_OPERATIONS)
    assert out["payload"]["operation_count"] == len(CORE_OPERATIONS)


def test_get_module_functions_core_case_insensitive() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_module_functions",
        {"module_id": "Modulr.Core"},
        "gmf-2",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.MODULE_FUNCTIONS_RETURNED)
    assert out["payload"]["module_id"] == "modulr.core"


def test_get_module_functions_unknown_module() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    req = make_validated_inbound(
        pk,
        "get_module_functions",
        {"module_id": "modulr.unknown"},
        "gmf-3",
    )
    with pytest.raises(WireValidationError) as ei:
        dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert ei.value.code is ErrorCode.MODULE_NOT_FOUND


def test_get_module_functions_registered_module_empty_manifest() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_module",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "route": {"base_url": "https://s.example"},
            "signing_public_key": sender_pub.hex(),
        },
        "gmf-reg",
    )
    dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    req = make_validated_inbound(
        pk,
        "get_module_functions",
        {"module_id": "modulr.storage"},
        "gmf-4",
    )
    out = dispatch_operation(req, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out["code"] == str(SuccessCode.MODULE_FUNCTIONS_RETURNED)
    assert out["payload"]["operations"] == []
    assert out["payload"]["operation_count"] == 0


def test_lookup_module_case_insensitive_after_register() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_module",
        {
            "module_name": "Modulr.Playground",
            "module_version": MODULE_VERSION,
            "route": {"base_url": "https://p.example"},
            "signing_public_key": sender_pub.hex(),
        },
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


def test_register_and_lookup_module() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_module",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "route": {"base_url": "https://s.example"},
            "signing_public_key": sender_pub.hex(),
        },
        "m1",
    )
    out1 = dispatch_operation(reg, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out1["status"] == "success"
    assert out1["code"] == str(SuccessCode.MODULE_REGISTERED)
    lu = make_validated_inbound(
        pk,
        "lookup_module",
        {"module_name": "modulr.storage"},
        "m2",
    )
    out2 = dispatch_operation(lu, settings=_settings(), conn=conn, clock=lambda: 1.0)
    assert out2["code"] == str(SuccessCode.MODULE_FOUND)
    assert out2["payload"]["module_name"] == "modulr.storage"


def test_submit_module_route_updates_module_route() -> None:
    pk = Ed25519PrivateKey.generate()
    conn = _conn()
    sender_pub = pk.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_module",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "route": {"base_url": "https://old.example"},
            "signing_public_key": sender_pub.hex(),
        },
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
        "register_module",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "route": {"base_url": "https://old.example"},
            "signing_public_key": other_pub.hex(),
        },
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
    allowed = other.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    ).hex()
    conn = _conn()
    mod_key = Ed25519PrivateKey.generate().public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    reg = make_validated_inbound(
        pk,
        "register_module",
        {
            "module_name": "modulr.x",
            "module_version": MODULE_VERSION,
            "route": {},
            "signing_public_key": mod_key.hex(),
        },
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
        "register_module",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "route": {},
            "signing_public_key": sender_pub.hex(),
        },
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
        "register_module",
        {
            "module_name": "modulr.storage",
            "module_version": MODULE_VERSION,
            "route": {},
            "signing_public_key": other_pub.hex(),
        },
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
    allowed_hex = allowed.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    ).hex()
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

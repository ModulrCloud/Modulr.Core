#!/usr/bin/env python3
"""Local smoke test against a running Modulr.Core HTTP server.

Builds signed envelopes (same rules as unit tests) and POSTs to ``/message``.

Prerequisites:
  - Install this repo editable with HTTP/dev deps: ``pip install -e ".[dev]"``
  - Start the server, e.g. ``modulr-core --config path/to/dev.toml``
    (``dev_mode = true`` and empty ``bootstrap_public_keys`` is fine for local use.)

Example::

    python scripts/smoke_local.py --base-url http://127.0.0.1:8000

For a later internal deployment, point ``--base-url`` at that host (still HTTPS
recommended once TLS terminates in front of the app).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from modulr_core import MODULE_VERSION
from modulr_core.messages.constants import TARGET_MODULE_CORE
from modulr_core.validation import envelope_signing_bytes, payload_hash

try:
    import httpx
except ImportError:
    print(
        'error: httpx is required. Install with: pip install -e ".[dev]"',
        file=sys.stderr,
    )
    raise SystemExit(2) from None


def _message_url(base: str) -> str:
    return f"{base.rstrip('/')}/message"


def _sign_envelope(
    *,
    private_key: Ed25519PrivateKey,
    message_id: str,
    operation: str,
    payload: dict[str, Any],
    now: float,
    expiry_window_s: float,
) -> bytes:
    pub = private_key.public_key().public_bytes(
        encoding=Encoding.Raw,
        format=PublicFormat.Raw,
    )
    ts = now - 2.0
    exp = now + expiry_window_s
    env: dict[str, Any] = {
        "protocol_version": MODULE_VERSION,
        "message_id": message_id,
        "target_module": TARGET_MODULE_CORE,
        "operation": operation,
        "sender_id": "user:smoke_local",
        "sender_key_type": "ed25519",
        "sender_public_key": pub.hex(),
        "timestamp": ts,
        "expires_at": exp,
        "payload": payload,
        "payload_hash": payload_hash(payload),
        "signature_algorithm": "ed25519",
    }
    preimage = envelope_signing_bytes(env)
    env["signature"] = private_key.sign(preimage).hex()
    return json.dumps(env, separators=(",", ":")).encode("utf-8")


def _post_json(client: httpx.Client, url: str, body: bytes) -> httpx.Response:
    return client.post(
        url,
        content=body,
        headers={"Content-Type": "application/json"},
    )


def _expect_success(resp: httpx.Response, *, step: str) -> dict[str, Any]:
    try:
        data = resp.json()
    except json.JSONDecodeError as e:
        print(
            f"{step}: HTTP {resp.status_code}; body is not JSON: {e}", file=sys.stderr
        )
        print(resp.text[:2000], file=sys.stderr)
        raise SystemExit(1) from e
    if resp.status_code != 200 or data.get("status") != "success":
        print(f"{step}: expected 200 success, got {resp.status_code}", file=sys.stderr)
        print(json.dumps(data, indent=2), file=sys.stderr)
        raise SystemExit(1)
    return data


def main() -> None:
    p = argparse.ArgumentParser(
        description=(
            "POST signed envelopes to a running Modulr.Core server (register, "
            "replay, lookup, heartbeat)."
        ),
        epilog=(
            "Requires: pip install -e \".[dev]\" and a running modulr-core "
            "(e.g. dev_mode true in TOML). "
            "Example: python scripts/smoke_local.py --base-url http://127.0.0.1:8000"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="Server origin (no trailing path), default %(default)s",
    )
    p.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="HTTP timeout in seconds (default %(default)s)",
    )
    p.add_argument(
        "--module-name",
        default=None,
        help="Dotted module name to register (default: smoke.<random>)",
    )
    p.add_argument(
        "--expiry-window",
        type=float,
        default=600.0,
        help="Envelope expiry window in seconds (default %(default)s)",
    )
    p.add_argument(
        "--skip-heartbeat",
        action="store_true",
        help="Only register, replay, and lookup (skip heartbeat_update)",
    )
    args = p.parse_args()

    url = _message_url(args.base_url)
    module_name = args.module_name or f"smoke.{uuid.uuid4().hex[:12]}"
    pk = Ed25519PrivateKey.generate()
    pub = pk.public_key().public_bytes(encoding=Encoding.Raw, format=PublicFormat.Raw)
    now = time.time()

    reg_payload: dict[str, Any] = {
        "module_name": module_name,
        "module_version": MODULE_VERSION,
        "route": {"base_url": "https://smoke.local.example"},
        "signing_public_key": pub.hex(),
    }
    reg_mid = f"smoke-reg-{uuid.uuid4().hex}"
    reg_body = _sign_envelope(
        private_key=pk,
        message_id=reg_mid,
        operation="register_module",
        payload=reg_payload,
        now=now,
        expiry_window_s=args.expiry_window,
    )

    with httpx.Client(timeout=args.timeout) as client:
        try:
            print(
                f"POST {url}  register_module  {module_name!r}  message_id={reg_mid}",
            )
            r1 = _post_json(client, url, reg_body)
            out1 = _expect_success(r1, step="register (first)")
            r2 = _post_json(client, url, reg_body)
            out2 = _expect_success(r2, step="register (replay, same body)")
            if out1 != out2:
                print(
                    "replay: success JSON must match first response",
                    file=sys.stderr,
                )
                print(
                    json.dumps({"first": out1, "second": out2}, indent=2),
                    file=sys.stderr,
                )
                raise SystemExit(1)
            print("replay: OK (identical JSON)")

            lookup_mid = f"smoke-lookup-{uuid.uuid4().hex}"
            lookup_body = _sign_envelope(
                private_key=pk,
                message_id=lookup_mid,
                operation="lookup_module",
                payload={"module_name": module_name},
                now=time.time(),
                expiry_window_s=args.expiry_window,
            )
            print(f"POST {url}  lookup_module  {module_name!r}")
            r3 = _post_json(client, url, lookup_body)
            _expect_success(r3, step="lookup_module")

            if not args.skip_heartbeat:
                hb_mid = f"smoke-hb-{uuid.uuid4().hex}"
                hb_payload: dict[str, Any] = {
                    "module_name": module_name,
                    "module_version": MODULE_VERSION,
                    "status": "ok",
                }
                hb_body = _sign_envelope(
                    private_key=pk,
                    message_id=hb_mid,
                    operation="heartbeat_update",
                    payload=hb_payload,
                    now=time.time(),
                    expiry_window_s=args.expiry_window,
                )
                print(f"POST {url}  heartbeat_update  {module_name!r}")
                r4 = _post_json(client, url, hb_body)
                _expect_success(r4, step="heartbeat_update")
        except httpx.RequestError as e:
            print(
                f"error: HTTP request failed (is modulr-core running?): {e}",
                file=sys.stderr,
            )
            raise SystemExit(2) from e

    print("smoke_local: all checks passed.")


if __name__ == "__main__":
    main()

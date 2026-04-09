"""``modulr-core genesis`` — local wizard (same semantics as ``POST /genesis/...``)."""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
import threading
from pathlib import Path

from modulr_core.clock import EpochClock, now_epoch_seconds
from modulr_core.config.load import load_settings
from modulr_core.errors.codes import SuccessCode
from modulr_core.errors.exceptions import ConfigurationError
from modulr_core.genesis.challenge import GenesisChallengeError
from modulr_core.genesis.completion import GenesisCompletionError
from modulr_core.genesis.local_invoke import (
    genesis_complete_payload,
    genesis_issue_challenge_payload,
    genesis_verify_challenge_payload,
)
from modulr_core.genesis.wire_map import (
    wire_error_for_genesis_challenge,
    wire_error_for_genesis_completion,
)
from modulr_core.http.config_resolve import resolve_config_path
from modulr_core.http.envelope import (
    error_response_envelope,
    unsigned_success_response_envelope,
)
from modulr_core.persistence import apply_migrations, open_database

logger = logging.getLogger(__name__)

_EXIT_BLOCKED_OR_USAGE = 2
_EXIT_DOMAIN = 1
_EXIT_OK = 0


def _print_json(obj: object) -> None:
    print(json.dumps(obj, indent=2, sort_keys=False))


def genesis_main(argv: list[str]) -> None:
    """Run genesis CLI; ``argv`` is everything after ``genesis``.

    On success or domain error, calls ``sys.exit`` (does not return).
    """
    parser = argparse.ArgumentParser(
        prog="modulr-core genesis",
        description=(
            "Run genesis steps against the configured SQLite database. Same rules as "
            "HTTP POST /genesis/challenge, /genesis/challenge/verify, and "
            "/genesis/complete. Disabled when network_environment is production."
        ),
        epilog=(
            "Put --config (-c) before the step. Example: "
            "``modulr-core genesis -c dev.toml challenge`` "
            "(plus ``--subject-signing-pubkey``)."
        ),
    )
    parser.add_argument(
        "-c",
        "--config",
        type=Path,
        default=None,
        help="Operator TOML (overrides MODULR_CORE_CONFIG).",
    )
    sub = parser.add_subparsers(dest="step", required=True, metavar="STEP")
    p_challenge = sub.add_parser(
        "challenge",
        help="Issue a genesis challenge (same body as POST /genesis/challenge).",
    )
    p_challenge.add_argument(
        "--subject-signing-pubkey",
        required=True,
        metavar="HEX",
        help="Operator Ed25519 public key (64 hex chars).",
    )
    p_verify = sub.add_parser(
        "verify",
        help="Verify a signature and consume the challenge "
        "(POST /genesis/challenge/verify).",
    )
    p_verify.add_argument(
        "--challenge-id",
        required=True,
        metavar="HEX",
    )
    p_verify.add_argument(
        "--signature-hex",
        required=True,
        metavar="HEX",
    )
    p_complete = sub.add_parser(
        "complete",
        help="Finish genesis (POST /genesis/complete).",
    )
    p_complete.add_argument("--challenge-id", required=True, metavar="HEX")
    p_complete.add_argument(
        "--subject-signing-pubkey",
        required=True,
        metavar="HEX",
    )
    p_complete.add_argument(
        "--root-organization-name",
        required=True,
        metavar="LABEL",
    )
    p_complete.add_argument(
        "--root-organization-signing-public-key-hex",
        required=True,
        metavar="HEX",
    )
    p_complete.add_argument(
        "--operator-display-name",
        default=None,
        metavar="NAME",
    )

    args = parser.parse_args(argv)

    try:
        path = resolve_config_path(args.config)
    except ConfigurationError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(_EXIT_BLOCKED_OR_USAGE)

    try:
        settings = load_settings(path)
    except ConfigurationError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(_EXIT_BLOCKED_OR_USAGE)

    if not settings.genesis_operations_allowed():
        print(
            "error: genesis CLI is not allowed for this deployment "
            "(e.g. network_environment=production).",
            file=sys.stderr,
        )
        sys.exit(_EXIT_BLOCKED_OR_USAGE)

    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    conn = open_database(settings.database_path, check_same_thread=False)
    apply_migrations(conn)
    lock = threading.Lock()
    clock = now_epoch_seconds

    try:
        if args.step == "challenge":
            _run_challenge(conn, lock, clock, args.subject_signing_pubkey)
        elif args.step == "verify":
            _run_verify(conn, lock, clock, args.challenge_id, args.signature_hex)
        else:
            _run_complete(
                conn,
                lock,
                clock,
                challenge_id=args.challenge_id.strip().lower(),
                subject_hex=args.subject_signing_pubkey,
                root_org_name=args.root_organization_name,
                org_pk_hex=args.root_organization_signing_public_key_hex,
                operator_display=args.operator_display_name,
            )
    finally:
        conn.close()

    sys.exit(_EXIT_OK)


def _run_challenge(
    conn: sqlite3.Connection,
    lock: threading.Lock,
    clock: EpochClock,
    subject_signing_pubkey_hex: str,
) -> None:
    with lock:
        try:
            payload = genesis_issue_challenge_payload(
                conn=conn,
                clock=clock,
                subject_signing_pubkey_hex=subject_signing_pubkey_hex.strip(),
            )
            conn.commit()
        except GenesisChallengeError as e:
            conn.rollback()
            code = wire_error_for_genesis_challenge(e)
            _print_json(
                error_response_envelope(code=code, detail=str(e), message_id=None),
            )
            sys.exit(_EXIT_DOMAIN)
        except Exception:
            logger.exception("genesis challenge issue")
            conn.rollback()
            print("error: internal error.", file=sys.stderr)
            sys.exit(_EXIT_BLOCKED_OR_USAGE)

    _print_json(
        unsigned_success_response_envelope(
            operation_response="genesis_challenge_issued_response",
            success_code=SuccessCode.GENESIS_CHALLENGE_ISSUED,
            detail=(
                "Genesis challenge issued; sign challenge_body with the operator key."
            ),
            payload=payload,
            clock=clock,
        ),
    )


def _run_verify(
    conn: sqlite3.Connection,
    lock: threading.Lock,
    clock: EpochClock,
    challenge_id: str,
    signature_hex: str,
) -> None:
    with lock:
        try:
            payload = genesis_verify_challenge_payload(
                conn=conn,
                clock=clock,
                challenge_id=challenge_id.strip(),
                signature_hex=signature_hex.strip(),
            )
            conn.commit()
        except GenesisChallengeError as e:
            conn.rollback()
            code = wire_error_for_genesis_challenge(e)
            _print_json(
                error_response_envelope(code=code, detail=str(e), message_id=None),
            )
            sys.exit(_EXIT_DOMAIN)
        except Exception:
            logger.exception("genesis challenge verify")
            conn.rollback()
            print("error: internal error.", file=sys.stderr)
            sys.exit(_EXIT_BLOCKED_OR_USAGE)

    _print_json(
        unsigned_success_response_envelope(
            operation_response="genesis_challenge_verified_response",
            success_code=SuccessCode.GENESIS_CHALLENGE_VERIFIED,
            detail="Genesis challenge signature verified and consumed.",
            payload=payload,
            clock=clock,
        ),
    )


def _run_complete(
    conn: sqlite3.Connection,
    lock: threading.Lock,
    clock: EpochClock,
    *,
    challenge_id: str,
    subject_hex: str,
    root_org_name: str,
    org_pk_hex: str,
    operator_display: str | None,
) -> None:
    with lock:
        try:
            out_payload = genesis_complete_payload(
                conn=conn,
                clock=clock,
                challenge_id=challenge_id,
                subject_signing_pubkey_hex=subject_hex.strip(),
                root_organization_name=root_org_name.strip(),
                root_organization_signing_public_key_hex=org_pk_hex.strip(),
                operator_display_name=operator_display.strip()
                if operator_display
                else None,
            )
            conn.commit()
        except GenesisCompletionError as e:
            conn.rollback()
            code = wire_error_for_genesis_completion(e)
            _print_json(
                error_response_envelope(code=code, detail=str(e), message_id=None),
            )
            sys.exit(_EXIT_DOMAIN)
        except Exception:
            logger.exception("genesis complete")
            conn.rollback()
            print("error: internal error.", file=sys.stderr)
            sys.exit(_EXIT_BLOCKED_OR_USAGE)

    _print_json(
        unsigned_success_response_envelope(
            operation_response="genesis_wizard_completed_response",
            success_code=SuccessCode.GENESIS_WIZARD_COMPLETED,
            detail="Genesis wizard completed; this deployment is live.",
            payload=out_payload,
            clock=clock,
        ),
    )

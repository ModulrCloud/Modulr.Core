"""Unsigned JSON routes for the genesis challenge wizard (local/testnet only)."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from modulr_core.errors.codes import ErrorCode, SuccessCode
from modulr_core.genesis.challenge import GenesisChallengeError, GenesisChallengeService
from modulr_core.http.envelope import (
    error_response_envelope,
    unsigned_success_response_envelope,
)
from modulr_core.http.status_map import http_status_for_error_code
from modulr_core.repositories.core_genesis import CoreGenesisRepository
from modulr_core.repositories.genesis_challenge import GenesisChallengeRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/genesis", tags=["genesis"])

# Maps :class:`GenesisChallengeError` messages to wire error codes (stable strings).
_GENESIS_CHALLENGE_MSG_TO_CODE: dict[str, ErrorCode] = {
    "genesis already complete": ErrorCode.GENESIS_ALREADY_COMPLETE,
    "unknown challenge_id": ErrorCode.GENESIS_CHALLENGE_NOT_FOUND,
    "challenge already consumed": ErrorCode.GENESIS_CHALLENGE_CONSUMED,
    "challenge expired": ErrorCode.GENESIS_CHALLENGE_EXPIRED,
    "invalid subject_signing_pubkey_hex": ErrorCode.PUBLIC_KEY_INVALID,
    "invalid Ed25519 public key": ErrorCode.PUBLIC_KEY_INVALID,
    "invalid signature hex": ErrorCode.INVALID_FIELD,
    "signature verification failed": ErrorCode.SIGNATURE_INVALID,
}


def wire_error_for_genesis_challenge(exc: GenesisChallengeError) -> ErrorCode:
    """
    Map a genesis challenge exception to a wire ``ErrorCode``.

    Args:
        exc: Exception raised by ``GenesisChallengeService``.

    Returns:
        Stable error code for the HTTP envelope.
    """
    msg = str(exc)
    return _GENESIS_CHALLENGE_MSG_TO_CODE.get(msg, ErrorCode.INVALID_REQUEST)


def _json_error(
    *,
    code: ErrorCode,
    detail: str,
) -> JSONResponse:
    return JSONResponse(
        error_response_envelope(code=code, detail=detail, message_id=None),
        status_code=http_status_for_error_code(code),
    )


def _parse_issue_json(data: Any) -> str:
    """
    Extract ``subject_signing_pubkey_hex`` from a parsed JSON body.

    Args:
        data: Value returned by ``json.loads`` (must be a dict).

    Returns:
        Non-empty stripped subject signing pubkey hex string.

    Raises:
        ValueError: If the shape is invalid or the field is missing/empty.
    """
    if not isinstance(data, dict):
        raise ValueError("request body must be a JSON object")
    raw = data.get("subject_signing_pubkey_hex")
    if not isinstance(raw, str):
        raise ValueError("subject_signing_pubkey_hex must be a string")
    pk = raw.strip()
    if not pk:
        raise ValueError("subject_signing_pubkey_hex must be non-empty")
    return pk


def _parse_verify_json(data: Any) -> tuple[str, str]:
    """
    Extract ``challenge_id`` and ``signature_hex`` from a parsed JSON body.

    Args:
        data: Value returned by ``json.loads`` (must be a dict).

    Returns:
        Tuple of stripped ``challenge_id`` and ``signature_hex``.

    Raises:
        ValueError: If the shape is invalid or a field is missing/empty.
    """
    if not isinstance(data, dict):
        raise ValueError("request body must be a JSON object")
    cid_raw = data.get("challenge_id")
    sig_raw = data.get("signature_hex")
    if not isinstance(cid_raw, str) or not isinstance(sig_raw, str):
        raise ValueError("challenge_id and signature_hex must be strings")
    challenge_id = cid_raw.strip()
    signature_hex = sig_raw.strip()
    if not challenge_id or not signature_hex:
        raise ValueError("challenge_id and signature_hex must be non-empty")
    return challenge_id, signature_hex


@router.post("/challenge")
async def post_genesis_challenge(request: Request) -> JSONResponse:
    """
    Issue a one-shot genesis challenge bound to ``subject_signing_pubkey_hex``.

    Gated by ``settings.genesis_operations_allowed()`` (403 otherwise).

    Returns:
        JSON success or error envelope matching ``POST /message`` error shape.
    """
    settings = request.app.state.settings
    if not settings.genesis_operations_allowed():
        return _json_error(
            code=ErrorCode.GENESIS_OPERATIONS_NOT_ALLOWED,
            detail="Genesis operations are not allowed for this deployment.",
        )

    body = await request.body()
    if len(body) > settings.max_http_body_bytes:
        return _json_error(
            code=ErrorCode.MESSAGE_TOO_LARGE,
            detail=(
                "request body exceeds max_http_body_bytes "
                f"({settings.max_http_body_bytes})"
            ),
        )

    try:
        parsed: Any = json.loads(body.decode("utf-8"))
    except UnicodeDecodeError:
        return _json_error(
            code=ErrorCode.MALFORMED_JSON,
            detail="Request body must be UTF-8 JSON.",
        )
    except json.JSONDecodeError as e:
        return _json_error(
            code=ErrorCode.MALFORMED_JSON,
            detail=f"Invalid JSON: {e}",
        )

    try:
        pubkey_hex = _parse_issue_json(parsed)
    except ValueError as e:
        return _json_error(code=ErrorCode.INVALID_REQUEST, detail=str(e))

    conn = request.app.state.conn
    clock = request.app.state.clock
    lock = request.app.state.conn_lock

    with lock:
        try:
            svc = GenesisChallengeService(
                genesis_repo=CoreGenesisRepository(conn),
                challenge_repo=GenesisChallengeRepository(conn),
                clock=clock,
            )
            issued = svc.issue(subject_signing_pubkey_hex=pubkey_hex)
            conn.commit()
        except GenesisChallengeError as e:
            conn.rollback()
            code = wire_error_for_genesis_challenge(e)
            return _json_error(code=code, detail=str(e))
        except Exception:
            logger.exception("unhandled error during genesis challenge issue")
            conn.rollback()
            return _json_error(
                code=ErrorCode.INTERNAL_ERROR,
                detail="Internal server error.",
            )

    payload = {
        "challenge_id": issued.challenge_id,
        "challenge_body": issued.body,
        "issued_at_unix": issued.issued_at_unix,
        "expires_at_unix": issued.expires_at_unix,
    }
    return JSONResponse(
        unsigned_success_response_envelope(
            operation_response="genesis_challenge_issued_response",
            success_code=SuccessCode.GENESIS_CHALLENGE_ISSUED,
            detail=(
                "Genesis challenge issued; sign challenge_body "
                "with the operator key."
            ),
            payload=payload,
            clock=clock,
        ),
        status_code=200,
    )


@router.post("/challenge/verify")
async def post_genesis_challenge_verify(request: Request) -> JSONResponse:
    """
    Verify an Ed25519 signature and consume the challenge (one shot).

    Gated by ``settings.genesis_operations_allowed()`` (403 otherwise).
    Wizard completion (user/org) is a later stage.

    Returns:
        JSON success or error envelope matching ``POST /message`` error shape.
    """
    settings = request.app.state.settings
    if not settings.genesis_operations_allowed():
        return _json_error(
            code=ErrorCode.GENESIS_OPERATIONS_NOT_ALLOWED,
            detail="Genesis operations are not allowed for this deployment.",
        )

    body = await request.body()
    if len(body) > settings.max_http_body_bytes:
        return _json_error(
            code=ErrorCode.MESSAGE_TOO_LARGE,
            detail=(
                "request body exceeds max_http_body_bytes "
                f"({settings.max_http_body_bytes})"
            ),
        )

    try:
        parsed: Any = json.loads(body.decode("utf-8"))
    except UnicodeDecodeError:
        return _json_error(
            code=ErrorCode.MALFORMED_JSON,
            detail="Request body must be UTF-8 JSON.",
        )
    except json.JSONDecodeError as e:
        return _json_error(
            code=ErrorCode.MALFORMED_JSON,
            detail=f"Invalid JSON: {e}",
        )

    try:
        challenge_id, signature_hex = _parse_verify_json(parsed)
    except ValueError as e:
        return _json_error(code=ErrorCode.INVALID_REQUEST, detail=str(e))

    conn = request.app.state.conn
    clock = request.app.state.clock
    lock = request.app.state.conn_lock

    with lock:
        try:
            svc = GenesisChallengeService(
                genesis_repo=CoreGenesisRepository(conn),
                challenge_repo=GenesisChallengeRepository(conn),
                clock=clock,
            )
            svc.verify_and_consume(
                challenge_id=challenge_id,
                signature_hex=signature_hex,
            )
            conn.commit()
        except GenesisChallengeError as e:
            conn.rollback()
            code = wire_error_for_genesis_challenge(e)
            return _json_error(code=code, detail=str(e))
        except Exception:
            logger.exception("unhandled error during genesis challenge verify")
            conn.rollback()
            return _json_error(
                code=ErrorCode.INTERNAL_ERROR,
                detail="Internal server error.",
            )

    return JSONResponse(
        unsigned_success_response_envelope(
            operation_response="genesis_challenge_verified_response",
            success_code=SuccessCode.GENESIS_CHALLENGE_VERIFIED,
            detail="Genesis challenge signature verified and consumed.",
            payload={"verified": True},
            clock=clock,
        ),
        status_code=200,
    )

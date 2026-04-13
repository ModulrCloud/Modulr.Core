"""Unsigned JSON routes for the genesis challenge wizard (local/testnet only)."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from modulr_core.errors.codes import ErrorCode, SuccessCode
from modulr_core.genesis.challenge import GenesisChallengeError
from modulr_core.genesis.completion import GenesisCompletionError
from modulr_core.genesis.local_invoke import (
    genesis_branding_payload,
    genesis_complete_payload,
    genesis_issue_challenge_payload,
    genesis_verify_challenge_payload,
)
from modulr_core.genesis.parsing import (
    parse_genesis_challenge_issue_body,
    parse_genesis_challenge_verify_body,
    parse_genesis_complete_body,
)
from modulr_core.genesis.wire_map import (
    wire_error_for_genesis_challenge,
    wire_error_for_genesis_completion,
)
from modulr_core.http.envelope import (
    error_response_envelope,
    unsigned_success_response_envelope,
)
from modulr_core.http.status_map import http_status_for_error_code

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/genesis", tags=["genesis"])


@router.get("/branding")
async def get_genesis_branding(request: Request) -> dict[str, object]:
    """
    Read persisted root org logo (SVG) and bootstrap operator profile image.

    Unsigned JSON (same family as ``GET /version``). Available whenever Core is
    reachable; when ``genesis_complete`` is false, image fields are null.
    """
    conn = request.app.state.conn
    lock = request.app.state.conn_lock
    with lock:
        return genesis_branding_payload(conn=conn)


def _json_error(
    *,
    code: ErrorCode,
    detail: str,
) -> JSONResponse:
    return JSONResponse(
        error_response_envelope(code=code, detail=detail, message_id=None),
        status_code=http_status_for_error_code(code),
    )


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
        pubkey_hex = parse_genesis_challenge_issue_body(parsed)
    except ValueError as e:
        return _json_error(code=ErrorCode.INVALID_REQUEST, detail=str(e))

    conn = request.app.state.conn
    clock = request.app.state.clock
    lock = request.app.state.conn_lock

    with lock:
        try:
            payload = genesis_issue_challenge_payload(
                conn=conn,
                clock=clock,
                subject_signing_pubkey_hex=pubkey_hex,
            )
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

    return JSONResponse(
        unsigned_success_response_envelope(
            operation_response="genesis_challenge_issued_response",
            success_code=SuccessCode.GENESIS_CHALLENGE_ISSUED,
            detail=(
                "Genesis challenge issued; sign challenge_body with the operator key."
            ),
            payload=payload,
            clock=clock,
        ),
        status_code=200,
    )


@router.post("/complete")
async def post_genesis_complete(request: Request) -> JSONResponse:
    """
    Finish genesis: bind root org name, operator and org keys, ``genesis_complete``.

    Requires a verified challenge (``POST /genesis/challenge/verify``) within the
    completion window. Gated by ``genesis_operations_allowed()`` (403 otherwise).

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
        parsed_body = parse_genesis_complete_body(parsed)
    except ValueError as e:
        return _json_error(code=ErrorCode.INVALID_REQUEST, detail=str(e))

    conn = request.app.state.conn
    clock = request.app.state.clock
    lock = request.app.state.conn_lock

    with lock:
        try:
            out_payload = genesis_complete_payload(
                conn=conn,
                clock=clock,
                challenge_id=parsed_body.challenge_id,
                subject_signing_pubkey_hex=parsed_body.subject_signing_pubkey_hex,
                root_organization_name=parsed_body.root_organization_name,
                root_organization_signing_public_key_hex=(
                    parsed_body.root_organization_signing_public_key_hex
                ),
                operator_display_name=parsed_body.operator_display_name,
                root_organization_logo_svg=parsed_body.root_organization_logo_svg,
                operator_profile_image=parsed_body.operator_profile_image_bytes,
                operator_profile_image_mime=parsed_body.operator_profile_image_mime,
            )
            conn.commit()
        except GenesisCompletionError as e:
            conn.rollback()
            code = wire_error_for_genesis_completion(e)
            return _json_error(code=code, detail=str(e))
        except Exception:
            logger.exception("unhandled error during genesis completion")
            conn.rollback()
            return _json_error(
                code=ErrorCode.INTERNAL_ERROR,
                detail="Internal server error.",
            )

    return JSONResponse(
        unsigned_success_response_envelope(
            operation_response="genesis_wizard_completed_response",
            success_code=SuccessCode.GENESIS_WIZARD_COMPLETED,
            detail="Genesis wizard completed; this deployment is live.",
            payload=out_payload,
            clock=clock,
        ),
        status_code=200,
    )


@router.post("/challenge/verify")
async def post_genesis_challenge_verify(request: Request) -> JSONResponse:
    """
    Verify an Ed25519 signature and consume the challenge (one shot).

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
        challenge_id, signature_hex = parse_genesis_challenge_verify_body(parsed)
    except ValueError as e:
        return _json_error(code=ErrorCode.INVALID_REQUEST, detail=str(e))

    conn = request.app.state.conn
    clock = request.app.state.clock
    lock = request.app.state.conn_lock

    with lock:
        try:
            payload = genesis_verify_challenge_payload(
                conn=conn,
                clock=clock,
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
            payload=payload,
            clock=clock,
        ),
        status_code=200,
    )

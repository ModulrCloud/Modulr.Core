"""FastAPI application: ``POST /message``."""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from starlette.routing import Mount

from modulr_core.clock import EpochClock, now_epoch_seconds
from modulr_core.config.load import load_settings
from modulr_core.config.schema import Settings
from modulr_core.errors.codes import ErrorCode
from modulr_core.errors.exceptions import WireValidationError
from modulr_core.http.config_resolve import resolve_config_path
from modulr_core.http.envelope import error_response_envelope, try_parse_message_id
from modulr_core.http.genesis import router as genesis_router
from modulr_core.http.replay_cache import parse_stored_response_envelope
from modulr_core.http.status_map import http_status_for_error_code
from modulr_core.messages import validate_inbound_request
from modulr_core.messages.constants import TARGET_MODULE_CORE
from modulr_core.operations.dispatch import dispatch_operation
from modulr_core.persistence import apply_migrations, open_database
from modulr_core.repositories.message_dedup import MessageDedupRepository
from modulr_core.version import MODULE_VERSION

logger = logging.getLogger(__name__)


def _verbose_http_env() -> bool:
    return os.environ.get("MODULR_CORE_VERBOSE", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def _log_registered_routes(app: FastAPI) -> None:
    lines: list[str] = []
    for route in app.routes:
        if isinstance(route, APIRoute):
            methods = ",".join(sorted(route.methods))
            lines.append(f"  {methods} {route.path}")
        elif isinstance(route, Mount):
            lines.append(f"  [mount] {route.path}")
    text = "\n".join(lines) if lines else "  (none)"
    logger.info("modulr-core verbose: registered routes:\n%s", text)


def _cors_allow_origins(settings: Settings) -> list[str]:
    """Origins allowed for browser clients (customer UI, etc.).

    Set :envvar:`MODULR_CORE_CORS_ORIGINS` to a comma-separated list to override.
    In ``dev_mode`` with no env override, local Next.js defaults are used.
    """
    raw = os.environ.get("MODULR_CORE_CORS_ORIGINS", "").strip()
    if raw:
        return [x.strip() for x in raw.split(",") if x.strip()]
    if settings.dev_mode:
        return [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    return []


def create_app(
    *,
    config_path: str | Path | None = None,
    settings: Settings | None = None,
    conn: sqlite3.Connection | None = None,
    clock: EpochClock | None = None,
) -> FastAPI:
    """Create the Modulr.Core HTTP app.

    For production, pass ``config_path`` (or set :envvar:`MODULR_CORE_CONFIG`) so
    settings and the database are loaded from disk. For tests, pass
    ``settings`` and ``conn`` (e.g. in-memory DB with migrations applied).
    Pass ``clock`` to override time (tests); production uses
    :func:`~modulr_core.clock.now_epoch_seconds`.
    """
    owns_conn = False
    if settings is not None and conn is not None:
        pass
    else:
        path = resolve_config_path(config_path)
        settings = load_settings(path)
        settings.database_path.parent.mkdir(parents=True, exist_ok=True)
        conn = open_database(settings.database_path, check_same_thread=False)
        apply_migrations(conn)
        owns_conn = True

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if _verbose_http_env():
            _log_registered_routes(app)
        yield
        if owns_conn:
            conn.close()

    app = FastAPI(title="Modulr.Core", lifespan=lifespan)
    app.state.settings = settings
    app.state.conn = conn
    app.state._owns_conn = owns_conn  # noqa: SLF001
    app.state.conn_lock = threading.Lock()
    app.state.clock = clock or now_epoch_seconds

    app.include_router(genesis_router)

    cors_origins = _cors_allow_origins(settings)
    if cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
        )

    @app.get("/version")
    async def get_version() -> dict[str, Any]:
        """Read-only metadata for connectivity checks (no signed envelope)."""
        s = app.state.settings
        return {
            "target_module": TARGET_MODULE_CORE,
            "version": MODULE_VERSION,
            "network_environment": s.network_environment.value,
            "network_name": s.resolved_network_display_name(),
            "genesis_operations_allowed": s.genesis_operations_allowed(),
        }

    @app.post("/message")
    async def post_message(request: Request) -> Response:
        body = await request.body()
        mid_hint = try_parse_message_id(body)

        with app.state.conn_lock:
            try:
                validated = validate_inbound_request(
                    body,
                    settings=app.state.settings,
                    conn=app.state.conn,
                    clock=app.state.clock,
                )
            except WireValidationError as e:
                app.state.conn.rollback()
                status = http_status_for_error_code(e.code)
                return JSONResponse(
                    error_response_envelope(
                        code=e.code,
                        detail=str(e),
                        message_id=mid_hint,
                    ),
                    status_code=status,
                )
            except Exception:
                logger.exception("unhandled error during validate_inbound_request")
                app.state.conn.rollback()
                return JSONResponse(
                    error_response_envelope(
                        code=ErrorCode.INTERNAL_ERROR,
                        detail="Internal server error.",
                        message_id=mid_hint,
                    ),
                    status_code=http_status_for_error_code(ErrorCode.INTERNAL_ERROR),
                )

            mid = validated.envelope["message_id"]
            dedup = MessageDedupRepository(app.state.conn)

            if validated.is_replay:
                row = dedup.get_by_message_id(mid)
                cached = parse_stored_response_envelope(
                    row["result_summary"] if row else None,
                )
                if cached is not None:
                    app.state.conn.commit()
                    return JSONResponse(cached, status_code=200)
                app.state.conn.rollback()
                return JSONResponse(
                    error_response_envelope(
                        code=ErrorCode.REPLAY_RESPONSE_UNAVAILABLE,
                        detail=(
                            "Identical request was replayed but no cached "
                            "response is available; use a new message_id."
                        ),
                        message_id=mid,
                    ),
                    status_code=http_status_for_error_code(
                        ErrorCode.REPLAY_RESPONSE_UNAVAILABLE,
                    ),
                )

            try:
                response_body = dispatch_operation(
                    validated,
                    settings=app.state.settings,
                    conn=app.state.conn,
                    clock=app.state.clock,
                )
            except WireValidationError as e:
                app.state.conn.rollback()
                status = http_status_for_error_code(e.code)
                return JSONResponse(
                    error_response_envelope(
                        code=e.code,
                        detail=str(e),
                        message_id=mid,
                    ),
                    status_code=status,
                )
            except Exception:
                logger.exception("unhandled error during dispatch_operation")
                app.state.conn.rollback()
                return JSONResponse(
                    error_response_envelope(
                        code=ErrorCode.INTERNAL_ERROR,
                        detail="Internal server error.",
                        message_id=mid,
                    ),
                    status_code=http_status_for_error_code(ErrorCode.INTERNAL_ERROR),
                )

            dedup.update_result_summary(
                mid,
                json.dumps(
                    response_body,
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
            )
            app.state.conn.commit()

        return JSONResponse(response_body, status_code=200)

    playground_dir = Path(__file__).resolve().parent / "static" / "playground"
    if settings.dev_mode and playground_dir.is_dir():

        @app.get("/playground/protocol-info")
        async def playground_protocol_info() -> dict[str, str]:
            return {
                "protocol_version": MODULE_VERSION,
                "target_module": TARGET_MODULE_CORE,
            }

        app.mount(
            "/playground",
            StaticFiles(directory=str(playground_dir), html=True),
            name="playground",
        )

    if _verbose_http_env():

        @app.middleware("http")
        async def _verbose_request_log(request: Request, call_next):
            q = request.url.query
            path = request.url.path
            qs = f"?{q}" if q else ""
            logger.info(
                "http <- %s %s%s origin=%r",
                request.method,
                path,
                qs,
                request.headers.get("origin"),
            )
            cl = request.headers.get("content-length")
            if cl:
                logger.info("http <- content-length=%s", cl)
            response = await call_next(request)
            logger.info(
                "http -> %s %s status=%s",
                request.method,
                path,
                response.status_code,
            )
            if response.status_code == 404:
                logger.warning(
                    "404 on %s %r — no route matched. If you expected GET /version, "
                    "restart modulr-core (or run pip install -e .) so the running "
                    "process loads the current code.",
                    request.method,
                    path,
                )
            return response

    return app

"""FastAPI application: ``POST /message``."""

from __future__ import annotations

import logging
import sqlite3
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from modulr_core.clock import EpochClock, now_epoch_seconds
from modulr_core.config.load import load_settings
from modulr_core.config.schema import Settings
from modulr_core.errors.codes import ErrorCode
from modulr_core.errors.exceptions import WireValidationError
from modulr_core.http.config_resolve import resolve_config_path
from modulr_core.http.envelope import error_response_envelope, try_parse_message_id
from modulr_core.http.status_map import http_status_for_error_code
from modulr_core.messages import validate_inbound_request
from modulr_core.operations.dispatch import dispatch_operation
from modulr_core.persistence import apply_migrations, open_database

logger = logging.getLogger(__name__)


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
        yield
        if owns_conn:
            conn.close()

    app = FastAPI(title="Modulr.Core", lifespan=lifespan)
    app.state.settings = settings
    app.state.conn = conn
    app.state._owns_conn = owns_conn  # noqa: SLF001
    app.state.conn_lock = threading.Lock()
    app.state.clock = clock or now_epoch_seconds

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

            app.state.conn.commit()

        return JSONResponse(response_body, status_code=200)

    return app

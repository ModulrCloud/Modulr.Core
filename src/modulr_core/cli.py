"""CLI entrypoint (``modulr-core`` / ``python -m modulr_core``)."""

from __future__ import annotations

import argparse
import errno
import logging
import os
import socket
import sys
from pathlib import Path

from modulr_core.errors.exceptions import ConfigurationError
from modulr_core.http.app import create_app
from modulr_core.http.config_resolve import resolve_config_path


def _preflight_listen(host: str, port: int) -> None:
    """Fail fast with a clear message if the TCP port is already bound.

    Resolves ``host`` with :func:`socket.getaddrinfo` so IPv6 (e.g. ``::1``) and
    hostnames behave like :func:`uvicorn.run`, instead of assuming IPv4 only.
    """
    try:
        infos = socket.getaddrinfo(
            host,
            port,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
    except socket.gaierror as e:
        print(
            f"error: cannot resolve --host {host!r}: {e}",
            file=sys.stderr,
        )
        sys.exit(1)

    if not infos:
        print(
            f"error: no TCP address for {host!r}:{port}",
            file=sys.stderr,
        )
        sys.exit(1)

    family, socktype, proto, _canon, sockaddr = infos[0]
    try:
        with socket.socket(family, socktype, proto) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(sockaddr)
    except OSError as e:
        in_use = e.errno == errno.EADDRINUSE
        if sys.platform == "win32" and getattr(e, "winerror", None) == 10048:
            in_use = True
        if in_use:
            print(
                f"error: cannot bind to {host}:{port} (address already in use). "
                f"Stop the other process or pass a different --port.",
                file=sys.stderr,
            )
            sys.exit(1)
        raise


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="modulr-core",
        description="Modulr.Core HTTP server (FastAPI + uvicorn).",
    )
    parser.add_argument(
        "--config",
        "-c",
        type=Path,
        default=None,
        help="Path to operator TOML (overrides MODULR_CORE_CONFIG).",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Debug: log each HTTP request and list routes at startup.",
    )
    args = parser.parse_args(argv)

    if args.verbose:
        os.environ["MODULR_CORE_VERBOSE"] = "1"
        logging.getLogger("modulr_core").setLevel(logging.DEBUG)

    try:
        path = resolve_config_path(args.config)
    except ConfigurationError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        import uvicorn
    except ImportError:
        print(
            "error: uvicorn is required. Install with: pip install 'modulr-core[http]'",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        app = create_app(config_path=path)
    except ConfigurationError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)

    _preflight_listen(args.host, args.port)
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="debug" if args.verbose else "info",
    )


if __name__ == "__main__":
    main()

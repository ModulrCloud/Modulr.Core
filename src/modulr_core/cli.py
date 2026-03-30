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


def _tcp_bind_address_in_use(err: OSError) -> bool:
    if err.errno == errno.EADDRINUSE:
        return True
    if sys.platform == "win32" and getattr(err, "winerror", None) == 10048:
        return True
    return False


def _preflight_listen(host: str, port: int) -> None:
    """Fail fast with a clear message if the TCP port is already bound.

    Resolves ``host`` the same way asyncio's :meth:`asyncio.loop.create_server`
    does (``getaddrinfo`` with ``AI_PASSIVE``, dedupe, one socket per result),
    and probes **every** resolved address. Hostnames such as ``localhost`` often
    map to several addresses; checking only the first can disagree with uvicorn.
    """
    try:
        infos = socket.getaddrinfo(
            host,
            port,
            family=socket.AF_UNSPEC,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
            flags=socket.AI_PASSIVE,
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

    # Match asyncio.base_events.BaseEventLoop.create_server (dedupe, reuse, v6only).
    unique_infos = set(infos)
    reuse_addr = os.name == "posix" and sys.platform != "cygwin"
    has_ipv6 = hasattr(socket, "AF_INET6")
    bound_any = False

    for family, socktype, proto, _canon, sockaddr in unique_infos:
        try:
            sock = socket.socket(family, socktype, proto)
        except OSError:
            continue
        try:
            if reuse_addr:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, True)
            if (
                has_ipv6
                and family == socket.AF_INET6
                and hasattr(socket, "IPPROTO_IPV6")
            ):
                sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, True)
            sock.bind(sockaddr)
            bound_any = True
        except OSError as e:
            if _tcp_bind_address_in_use(e):
                print(
                    f"error: cannot bind to {host}:{port} (address already in use). "
                    f"Stop the other process or pass a different --port.",
                    file=sys.stderr,
                )
                sys.exit(1)
            raise
        finally:
            sock.close()

    if not bound_any:
        print(
            f"error: cannot bind to {host!r}:{port} (no usable socket for resolved addresses).",
            file=sys.stderr,
        )
        sys.exit(1)


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

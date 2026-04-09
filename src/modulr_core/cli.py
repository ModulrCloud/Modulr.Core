"""CLI entrypoint (``modulr-core`` / ``python -m modulr_core``)."""

from __future__ import annotations

import argparse
import errno
import ipaddress
import logging
import os
import socket
import sys
from pathlib import Path

from fastapi import FastAPI

from modulr_core.config.load import load_settings
from modulr_core.errors.exceptions import ConfigurationError
from modulr_core.http.app import create_app
from modulr_core.http.config_resolve import resolve_config_path

# Directory containing this package (watch target for ``--reload``).
_MODULR_CORE_PACKAGE_DIR = Path(__file__).resolve().parent


def create_cli_app_for_reload() -> FastAPI:
    """ASGI factory for uvicorn ``--reload``.

    Uvicorn requires an import string (not an in-memory app) for reload to run.
    The parent sets :envvar:`MODULR_CORE_CONFIG` to an absolute path before
    spawning workers.
    """
    return create_app(config_path=None)


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
            f"error: cannot bind to {host!r}:{port} "
            "(no usable socket for resolved addresses).",
            file=sys.stderr,
        )
        sys.exit(1)


def _lan_ipv4_addresses() -> list[str]:
    """Best-effort non-loopback IPv4 addresses for LAN connection hints."""
    found: list[str] = []
    seen: set[str] = set()

    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            probe.connect(("10.254.254.254", 1))
            ip = probe.getsockname()[0]
            if ip and not ip.startswith("127."):
                seen.add(ip)
                found.append(ip)
        finally:
            probe.close()
    except OSError:
        pass

    try:
        hn = socket.gethostname()
        for res in socket.getaddrinfo(hn, None, socket.AF_INET, socket.SOCK_STREAM):
            ip = res[4][0]
            if ip.startswith("127.") or ip in seen:
                continue
            seen.add(ip)
            found.append(ip)
    except OSError:
        pass

    return sorted(found, key=lambda a: int(ipaddress.IPv4Address(a)))


def _print_listen_hints(host: str, port: int, *, https: bool) -> None:
    """Print human-readable URLs so operators know how to reach Core."""
    scheme = "https" if https else "http"
    if host in ("127.0.0.1", "::1"):
        print(f"modulr-core: {scheme}://127.0.0.1:{port}/ (loopback only)")
        addrs = _lan_ipv4_addresses()
        if addrs:
            print(
                "  LAN IP(s) on this machine:",
                ", ".join(addrs),
                "(use --host 0.0.0.0 so other PCs can connect)",
            )
        return

    print(f"modulr-core: {scheme}://127.0.0.1:{port}/ (this machine)")
    if host in ("0.0.0.0", "::"):
        addrs = _lan_ipv4_addresses()
        if addrs:
            for a in addrs:
                print(f"  {scheme}://{a}:{port}/ (other devices on your network)")
        else:
            print(
                "  (Could not auto-detect LAN IP; check ipconfig / "
                "Settings → Network on this host.)",
            )
    else:
        print(f"  {scheme}://{host}:{port}/")


def main(argv: list[str] | None = None) -> None:
    argv = sys.argv[1:] if argv is None else argv
    if argv and argv[0] == "genesis":
        from modulr_core.genesis.cli import genesis_main

        genesis_main(argv[1:])
        return

    parser = argparse.ArgumentParser(
        prog="modulr-core",
        description=(
            "Modulr.Core: HTTP server (default), or ``modulr-core genesis …`` for "
            "local genesis wizard steps."
        ),
    )
    parser.add_argument(
        "--config",
        "-c",
        type=Path,
        default=None,
        help="Path to operator TOML (overrides MODULR_CORE_CONFIG).",
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help=(
            "Bind address. Default 0.0.0.0 (all interfaces) so other machines on the "
            "LAN can reach Core; use 127.0.0.1 for this machine only."
        ),
    )
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Debug: log each HTTP request and list routes at startup.",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help=(
            "Development only: restart when Python files under the modulr_core "
            "package change. Install modulr-core[http] or uvicorn[standard] for "
            "efficient file watching."
        ),
    )
    parser.add_argument(
        "--ssl-keyfile",
        type=Path,
        default=None,
        metavar="PATH",
        help=(
            "PEM private key for HTTPS. Use with --ssl-certfile "
            "(e.g. certs from mkcert)."
        ),
    )
    parser.add_argument(
        "--ssl-certfile",
        type=Path,
        default=None,
        metavar="PATH",
        help="PEM certificate for HTTPS. Use with --ssl-keyfile.",
    )
    args = parser.parse_args(argv)

    if (args.ssl_keyfile is None) ^ (args.ssl_certfile is None):
        print(
            "error: --ssl-keyfile and --ssl-certfile must be passed together "
            "(or omit both for HTTP).",
            file=sys.stderr,
        )
        sys.exit(1)
    if args.ssl_keyfile is not None:
        if not args.ssl_keyfile.is_file():
            print(
                f"error: --ssl-keyfile is not a file: {args.ssl_keyfile}",
                file=sys.stderr,
            )
            sys.exit(1)
        if not args.ssl_certfile.is_file():
            print(
                f"error: --ssl-certfile is not a file: {args.ssl_certfile}",
                file=sys.stderr,
            )
            sys.exit(1)

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

    # With --reload, uvicorn supervises workers; skip create_app() in this process
    # so the supervisor never holds an SQLite connection or runs migrations.
    try:
        if args.reload:
            load_settings(path)
        else:
            app = create_app(config_path=path)
    except ConfigurationError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)

    _preflight_listen(args.host, args.port)
    log_level = "debug" if args.verbose else "info"
    ssl_kwargs: dict[str, str] = {}
    if args.ssl_keyfile is not None:
        ssl_kwargs["ssl_keyfile"] = str(args.ssl_keyfile.resolve())
        ssl_kwargs["ssl_certfile"] = str(args.ssl_certfile.resolve())
    _print_listen_hints(args.host, args.port, https=bool(ssl_kwargs))
    if args.reload:
        # Uvicorn only enables reload when the app is given as an import string.
        os.environ["MODULR_CORE_CONFIG"] = str(path.resolve())
        reload_dirs = [str(_MODULR_CORE_PACKAGE_DIR)]
        uvicorn.run(
            "modulr_core.cli:create_cli_app_for_reload",
            factory=True,
            host=args.host,
            port=args.port,
            log_level=log_level,
            reload=True,
            reload_dirs=reload_dirs,
            **ssl_kwargs,
        )
    else:
        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            log_level=log_level,
            **ssl_kwargs,
        )


if __name__ == "__main__":
    main()

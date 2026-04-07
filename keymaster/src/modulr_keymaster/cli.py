"""CLI: run Keymaster loopback server."""

from __future__ import annotations

import argparse
import sys

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Keymaster local web UI")
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind address (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8765,
        help="Port (default: 8765)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Dev auto-reload (watch package files)",
    )
    args = parser.parse_args()

    if args.host in ("0.0.0.0", "::"):
        print(
            "Keymaster: binding to all interfaces is discouraged; "
            "this tool is intended for loopback only.",
            file=sys.stderr,
        )

    uvicorn.run(
        "modulr_keymaster.app:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()

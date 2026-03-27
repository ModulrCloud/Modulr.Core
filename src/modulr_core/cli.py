"""CLI entrypoint (``modulr-core`` / ``python -m modulr_core``)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from modulr_core.errors.exceptions import ConfigurationError
from modulr_core.http.app import create_app
from modulr_core.http.config_resolve import resolve_config_path


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
    args = parser.parse_args(argv)

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

    app = create_app(config_path=path)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()

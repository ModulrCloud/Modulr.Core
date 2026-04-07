"""FastAPI app: themed static UI for Keymaster (mock data until vault exists)."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

_PKG_DIR = Path(__file__).resolve().parent

MOCK_PROFILES: list[dict[str, str]] = [
    {
        "id": "personal",
        "display_name": "Personal",
        "public_key_hex": (
            "3f8a2c1e9b0d4f7a6e5c8b1d2f0a3948"
            "7e6d5c4b3a291807f6e5d4c3b2a1908f"
        ),
        "created_at": "2026-03-28T14:22:00Z",
    },
    {
        "id": "organization",
        "display_name": "Organization",
        "public_key_hex": (
            "a1b2c3d4e5f60718293a4b5c6d7e8f90"
            "0f1e2d3c4b5a69788796a5b4c3d2e1f0"
        ),
        "created_at": "2026-03-29T09:15:00Z",
    },
]


def _profile_by_id(profile_id: str) -> dict[str, str] | None:
    for p in MOCK_PROFILES:
        if p["id"] == profile_id:
            return p
    return None


def create_app() -> FastAPI:
    app = FastAPI(title="Keymaster", version="0.1.0", docs_url=None, redoc_url=None)
    templates = Jinja2Templates(directory=str(_PKG_DIR / "templates"))
    app.mount(
        "/static",
        StaticFiles(directory=str(_PKG_DIR / "static")),
        name="static",
    )

    def ctx(request: Request, **extra: object) -> dict[str, object]:
        out: dict[str, object] = {
            "request": request,
            "ui_preview": True,
            "nav_section": "none",
        }
        out.update(extra)
        return out

    @app.get("/", response_class=RedirectResponse)
    async def root() -> RedirectResponse:
        return RedirectResponse(url="/unlock", status_code=302)

    @app.get("/unlock", response_class=HTMLResponse)
    async def unlock(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request,
            "unlock.html",
            ctx(request, page_title="Unlock vault", nav_section="unlock"),
        )

    @app.get("/setup", response_class=HTMLResponse)
    async def setup(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request,
            "setup.html",
            ctx(request, page_title="Create vault", nav_section="setup"),
        )

    @app.get("/identities", response_class=HTMLResponse)
    async def identities(request: Request) -> HTMLResponse:
        return templates.TemplateResponse(
            request,
            "dashboard.html",
            ctx(
                request,
                page_title="Identities",
                profiles=MOCK_PROFILES,
                nav_section="identities",
            ),
        )

    @app.get("/identities/{profile_id}", response_class=HTMLResponse)
    async def identity_detail(request: Request, profile_id: str) -> HTMLResponse:
        profile = _profile_by_id(profile_id)
        if profile is None:
            return templates.TemplateResponse(
                request,
                "not_found.html",
                ctx(request, page_title="Not found", nav_section="none"),
                status_code=404,
            )
        return templates.TemplateResponse(
            request,
            "profile_detail.html",
            ctx(
                request,
                page_title=profile["display_name"],
                profile=profile,
                nav_section="detail",
            ),
        )

    return app

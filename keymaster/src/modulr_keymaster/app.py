"""FastAPI app: Keymaster loopback UI and encrypted vault."""

from __future__ import annotations

import json
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from modulr_keymaster.paths import vault_exists, vault_json_path
from modulr_keymaster.profiles import (
    empty_inner_payload,
    inner_payload_to_profiles,
    new_profile,
    profiles_to_inner_payload,
    rename_profile_in_list,
    sign_challenge_utf8,
    validate_display_name,
)
from modulr_keymaster.sessions import (
    SESSION_COOKIE,
    UnlockedVault,
    find_profile,
    new_session_id,
    prune_expired_sessions,
    replace_session_vault,
    resolve_unlocked_vault,
)
from modulr_keymaster.vault_crypto import (
    MIN_PASSPHRASE_LENGTH,
    VaultCryptoError,
    decrypt_vault_payload,
    encrypt_vault_payload,
)
from modulr_keymaster.vault_file import read_envelope, write_envelope

_PKG_DIR = Path(__file__).resolve().parent


def _ctx(request: Request, **extra: object) -> dict[str, object]:
    out: dict[str, object] = {
        "request": request,
        "nav_section": "none",
    }
    out.update(extra)
    return out


def _session_vault(request: Request) -> UnlockedVault | None:
    sid = request.cookies.get(SESSION_COOKIE)
    sessions = request.app.state.keymaster_sessions
    return resolve_unlocked_vault(sessions, sid)


def _bind_session(
    response: RedirectResponse,
    request: Request,
    vault: UnlockedVault,
) -> None:
    sessions = request.app.state.keymaster_sessions
    sid = new_session_id(sessions, vault)
    response.set_cookie(
        SESSION_COOKIE,
        sid,
        httponly=True,
        samesite="lax",
        path="/",
    )


def _clear_session(response: RedirectResponse, request: Request) -> None:
    sid = request.cookies.get(SESSION_COOKIE)
    if sid:
        request.app.state.keymaster_sessions.pop(sid, None)
    response.delete_cookie(SESSION_COOKIE, path="/")


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.keymaster_sessions = {}
        yield

    app = FastAPI(
        title="Keymaster",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )
    templates = Jinja2Templates(directory=str(_PKG_DIR / "templates"))
    app.mount(
        "/static",
        StaticFiles(directory=str(_PKG_DIR / "static")),
        name="static",
    )

    @app.middleware("http")
    async def expire_stale_sessions(request: Request, call_next):
        prune_expired_sessions(request.app.state.keymaster_sessions)
        return await call_next(request)

    @app.get("/", response_class=RedirectResponse, response_model=None)
    async def root() -> RedirectResponse:
        if not vault_exists():
            return RedirectResponse("/setup", status_code=302)
        return RedirectResponse("/unlock", status_code=302)

    @app.get("/unlock", response_model=None)
    async def unlock_get(request: Request) -> HTMLResponse | RedirectResponse:
        if not vault_exists():
            return RedirectResponse("/setup", status_code=302)
        if _session_vault(request) is not None:
            return RedirectResponse("/identities", status_code=302)
        return templates.TemplateResponse(
            request,
            "unlock.html",
            _ctx(request, page_title="Unlock vault", nav_section="unlock"),
        )

    @app.post("/unlock", response_model=None)
    async def unlock_post(
        request: Request,
        passphrase: Annotated[str, Form()],
    ) -> HTMLResponse:
        if not vault_exists():
            return RedirectResponse("/setup", status_code=303)
        path = vault_json_path()
        try:
            envelope = read_envelope(path)
            inner = decrypt_vault_payload(passphrase, envelope)
            profiles = inner_payload_to_profiles(inner)
        except (OSError, ValueError, VaultCryptoError):
            return templates.TemplateResponse(
                request,
                "unlock.html",
                _ctx(
                    request,
                    page_title="Unlock vault",
                    nav_section="unlock",
                    error="Incorrect passphrase, or the vault file is damaged.",
                ),
                status_code=401,
            )
        vault = UnlockedVault(profiles)
        response = RedirectResponse("/identities", status_code=303)
        _bind_session(response, request, vault)
        return response

    @app.get("/setup", response_class=HTMLResponse)
    async def setup_get(request: Request) -> HTMLResponse:
        if vault_exists():
            return templates.TemplateResponse(
                request,
                "setup.html",
                _ctx(
                    request,
                    page_title="Create vault",
                    nav_section="setup",
                    vault_already_exists=True,
                ),
            )
        return templates.TemplateResponse(
            request,
            "setup.html",
            _ctx(request, page_title="Create vault", nav_section="setup"),
        )

    @app.post("/setup", response_model=None)
    async def setup_post(
        request: Request,
        pw1: Annotated[str, Form()],
        pw2: Annotated[str, Form()],
    ) -> HTMLResponse | RedirectResponse:
        if vault_exists():
            return templates.TemplateResponse(
                request,
                "setup.html",
                _ctx(
                    request,
                    page_title="Create vault",
                    nav_section="setup",
                    vault_already_exists=True,
                    error="A vault already exists on this machine. Unlock it instead.",
                ),
                status_code=400,
            )
        err: str | None = None
        if pw1 != pw2:
            err = "Passphrases do not match."
        elif len(pw1) < MIN_PASSPHRASE_LENGTH:
            err = f"Passphrase must be at least {MIN_PASSPHRASE_LENGTH} characters."

        if err:
            return templates.TemplateResponse(
                request,
                "setup.html",
                _ctx(
                    request,
                    page_title="Create vault",
                    nav_section="setup",
                    error=err,
                ),
                status_code=400,
            )

        inner = empty_inner_payload()
        envelope = encrypt_vault_payload(pw1, inner)
        try:
            write_envelope(vault_json_path(), envelope)
        except OSError:
            return templates.TemplateResponse(
                request,
                "setup.html",
                _ctx(
                    request,
                    page_title="Create vault",
                    nav_section="setup",
                    error=(
                        "Could not write the vault file. "
                        "Check disk space and permissions."
                    ),
                ),
                status_code=500,
            )

        profiles = inner_payload_to_profiles(inner)
        vault = UnlockedVault(profiles)
        response = RedirectResponse("/identities?created=1", status_code=303)
        _bind_session(response, request, vault)
        return response

    @app.post("/lock", response_class=RedirectResponse)
    async def lock_post(request: Request) -> RedirectResponse:
        response = RedirectResponse("/unlock", status_code=303)
        _clear_session(response, request)
        return response

    @app.get("/identities", response_model=None)
    async def identities(request: Request) -> HTMLResponse | RedirectResponse:
        vault = _session_vault(request)
        if vault is None:
            return RedirectResponse("/unlock", status_code=302)
        rows = [p.to_public_dict() for p in vault.profiles]
        created = request.query_params.get("created") == "1"
        return templates.TemplateResponse(
            request,
            "dashboard.html",
            _ctx(
                request,
                page_title="Identities",
                profiles=rows,
                nav_section="identities",
                vault_created=created,
            ),
        )

    @app.get("/identities/new", response_model=None)
    async def identities_new_get(
        request: Request,
    ) -> HTMLResponse | RedirectResponse:
        if _session_vault(request) is None:
            return RedirectResponse("/unlock", status_code=302)
        return templates.TemplateResponse(
            request,
            "profile_new.html",
            _ctx(request, page_title="New identity", nav_section="new"),
        )

    @app.post("/identities/new", response_model=None)
    async def identities_new_post(
        request: Request,
        display_name: Annotated[str, Form()],
        passphrase: Annotated[str, Form()],
    ) -> HTMLResponse | RedirectResponse:
        sid = request.cookies.get(SESSION_COOKIE)
        sessions = request.app.state.keymaster_sessions
        if resolve_unlocked_vault(sessions, sid) is None:
            return RedirectResponse("/unlock", status_code=303)

        try:
            name = validate_display_name(display_name)
        except ValueError as e:
            return templates.TemplateResponse(
                request,
                "profile_new.html",
                _ctx(
                    request,
                    page_title="New identity",
                    nav_section="new",
                    error=str(e),
                ),
                status_code=400,
            )

        path = vault_json_path()
        try:
            envelope = read_envelope(path)
            disk_inner = decrypt_vault_payload(passphrase, envelope)
            profiles = inner_payload_to_profiles(disk_inner)
        except (OSError, ValueError, VaultCryptoError):
            return templates.TemplateResponse(
                request,
                "profile_new.html",
                _ctx(
                    request,
                    page_title="New identity",
                    nav_section="new",
                    error="Incorrect passphrase, or the vault file is damaged.",
                ),
                status_code=401,
            )

        try:
            added = new_profile(name)
        except ValueError as e:
            return templates.TemplateResponse(
                request,
                "profile_new.html",
                _ctx(
                    request,
                    page_title="New identity",
                    nav_section="new",
                    error=str(e),
                ),
                status_code=400,
            )

        profiles.append(added)
        inner_out = profiles_to_inner_payload(profiles)
        try:
            envelope_out = encrypt_vault_payload(passphrase, inner_out)
            write_envelope(path, envelope_out)
        except OSError:
            return templates.TemplateResponse(
                request,
                "profile_new.html",
                _ctx(
                    request,
                    page_title="New identity",
                    nav_section="new",
                    error="Could not write the vault file.",
                ),
                status_code=500,
            )

        replace_session_vault(sessions, sid, UnlockedVault(profiles))
        return RedirectResponse(f"/identities/{added.id}", status_code=303)

    @app.get("/identities/{profile_id}/sign", response_model=None)
    async def identity_sign_get(
        request: Request,
        profile_id: str,
    ) -> HTMLResponse | RedirectResponse:
        vault = _session_vault(request)
        if vault is None:
            return RedirectResponse("/unlock", status_code=302)
        profile = find_profile(vault, profile_id)
        if profile is None:
            return templates.TemplateResponse(
                request,
                "not_found.html",
                _ctx(request, page_title="Not found", nav_section="none"),
                status_code=404,
            )
        return templates.TemplateResponse(
            request,
            "profile_sign.html",
            _ctx(
                request,
                page_title=f"Sign — {profile.display_name}",
                profile=profile.to_public_dict(),
                nav_section="sign",
                signature_hex=None,
                challenge_value="",
                error=None,
            ),
        )

    @app.post("/identities/{profile_id}/sign", response_model=None)
    async def identity_sign_post(
        request: Request,
        profile_id: str,
        challenge: str = Form(""),
    ) -> HTMLResponse | RedirectResponse:
        vault = _session_vault(request)
        if vault is None:
            return RedirectResponse("/unlock", status_code=303)
        profile = find_profile(vault, profile_id)
        if profile is None:
            return templates.TemplateResponse(
                request,
                "not_found.html",
                _ctx(request, page_title="Not found", nav_section="none"),
                status_code=404,
            )

        err: str | None = None
        sig_hex: str | None = None
        if challenge == "":
            err = (
                "Paste the challenge text Core (or your checklist) gave you, "
                "then sign."
            )
        else:
            try:
                sig = sign_challenge_utf8(profile.private_key, challenge)
                sig_hex = sig.hex()
            except ValueError as e:
                err = str(e)

        return templates.TemplateResponse(
            request,
            "profile_sign.html",
            _ctx(
                request,
                page_title=f"Sign — {profile.display_name}",
                profile=profile.to_public_dict(),
                nav_section="sign",
                signature_hex=sig_hex,
                challenge_value=challenge,
                error=err,
            ),
            status_code=400 if err else 200,
        )

    def _safe_export_pub_filename(display_name: str, profile_id: str) -> str:
        slug = re.sub(r"[^a-zA-Z0-9._-]+", "_", (display_name or "").strip())
        slug = slug.strip("._-")[:48] or profile_id.split("-", 1)[0]
        return f"{slug}-ed25519.pub.json"

    @app.get("/identities/{profile_id}/rename", response_model=None)
    async def identity_rename_get(
        request: Request,
        profile_id: str,
    ) -> HTMLResponse | RedirectResponse:
        vault = _session_vault(request)
        if vault is None:
            return RedirectResponse("/unlock", status_code=302)
        profile = find_profile(vault, profile_id)
        if profile is None:
            return templates.TemplateResponse(
                request,
                "not_found.html",
                _ctx(request, page_title="Not found", nav_section="none"),
                status_code=404,
            )
        return templates.TemplateResponse(
            request,
            "profile_rename.html",
            _ctx(
                request,
                page_title=f"Rename — {profile.display_name}",
                profile=profile.to_public_dict(),
                nav_section="rename",
                error=None,
                form_display_name=profile.display_name,
            ),
        )

    @app.post("/identities/{profile_id}/rename", response_model=None)
    async def identity_rename_post(
        request: Request,
        profile_id: str,
        display_name: Annotated[str, Form()],
        passphrase: Annotated[str, Form()],
    ) -> HTMLResponse | RedirectResponse:
        sid = request.cookies.get(SESSION_COOKIE)
        sessions = request.app.state.keymaster_sessions
        if resolve_unlocked_vault(sessions, sid) is None:
            return RedirectResponse("/unlock", status_code=303)

        vault = _session_vault(request)
        if vault is None:
            return RedirectResponse("/unlock", status_code=303)
        if find_profile(vault, profile_id) is None:
            return templates.TemplateResponse(
                request,
                "not_found.html",
                _ctx(request, page_title="Not found", nav_section="none"),
                status_code=404,
            )

        try:
            validate_display_name(display_name)
        except ValueError as e:
            prof = find_profile(vault, profile_id)
            assert prof is not None
            return templates.TemplateResponse(
                request,
                "profile_rename.html",
                _ctx(
                    request,
                    page_title=f"Rename — {prof.display_name}",
                    profile=prof.to_public_dict(),
                    nav_section="rename",
                    error=str(e),
                    form_display_name=(display_name or "").strip(),
                ),
                status_code=400,
            )

        path = vault_json_path()
        try:
            envelope = read_envelope(path)
            disk_inner = decrypt_vault_payload(passphrase, envelope)
            profiles = inner_payload_to_profiles(disk_inner)
        except (OSError, ValueError, VaultCryptoError):
            prof = find_profile(vault, profile_id)
            assert prof is not None
            return templates.TemplateResponse(
                request,
                "profile_rename.html",
                _ctx(
                    request,
                    page_title=f"Rename — {prof.display_name}",
                    profile=prof.to_public_dict(),
                    nav_section="rename",
                    error="Incorrect passphrase, or the vault file is damaged.",
                    form_display_name=(display_name or "").strip(),
                ),
                status_code=401,
            )

        if not rename_profile_in_list(profiles, profile_id, display_name):
            return templates.TemplateResponse(
                request,
                "not_found.html",
                _ctx(request, page_title="Not found", nav_section="none"),
                status_code=404,
            )

        inner_out = profiles_to_inner_payload(profiles)
        try:
            envelope_out = encrypt_vault_payload(passphrase, inner_out)
            write_envelope(path, envelope_out)
        except OSError:
            prof = find_profile(vault, profile_id)
            assert prof is not None
            return templates.TemplateResponse(
                request,
                "profile_rename.html",
                _ctx(
                    request,
                    page_title=f"Rename — {prof.display_name}",
                    profile=prof.to_public_dict(),
                    nav_section="rename",
                    error="Could not write the vault file.",
                    form_display_name=(display_name or "").strip(),
                ),
                status_code=500,
            )

        replace_session_vault(sessions, sid, UnlockedVault(profiles))
        return RedirectResponse(f"/identities/{profile_id}", status_code=303)

    @app.get("/identities/{profile_id}/export-pub", response_model=None)
    async def identity_export_pub(
        request: Request,
        profile_id: str,
    ) -> Response | RedirectResponse:
        vault = _session_vault(request)
        if vault is None:
            return RedirectResponse("/unlock", status_code=302)
        profile = find_profile(vault, profile_id)
        if profile is None:
            return templates.TemplateResponse(
                request,
                "not_found.html",
                _ctx(request, page_title="Not found", nav_section="none"),
                status_code=404,
            )
        body = profile.to_export_public_v1()
        filename = _safe_export_pub_filename(profile.display_name, profile.id)
        payload = json.dumps(body, indent=2) + "\n"
        return Response(
            content=payload.encode("utf-8"),
            media_type="application/json; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

    @app.get("/identities/{profile_id}", response_model=None)
    async def identity_detail(
        request: Request,
        profile_id: str,
    ) -> HTMLResponse | RedirectResponse:
        vault = _session_vault(request)
        if vault is None:
            return RedirectResponse("/unlock", status_code=302)
        profile = find_profile(vault, profile_id)
        if profile is None:
            return templates.TemplateResponse(
                request,
                "not_found.html",
                _ctx(request, page_title="Not found", nav_section="none"),
                status_code=404,
            )
        return templates.TemplateResponse(
            request,
            "profile_detail.html",
            _ctx(
                request,
                page_title=profile.display_name,
                profile=profile.to_public_dict(),
                nav_section="detail",
            ),
        )

    return app

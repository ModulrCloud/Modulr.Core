"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  PROFILE_IMAGE_FILE_ACCEPT,
  PROFILE_IMAGE_MAX_BYTES,
  isProfileImageMimeAllowedForCore,
  normalizeProfileImageMimeForCore,
} from "@/lib/settings";
import {
  clearMockNetworkHandle,
  clearMockOrganizationKey,
  getMockProfileBio,
  MOCK_IDENTITY_CHANGED_EVENT,
  notifyMockIdentityChanged,
  setMockProfileAvatarDataUrl,
  setMockProfileBio,
  setShellSignedIn,
} from "@/lib/mockShellIdentity";

import { MOCK_PROFILE_BIO_DEV_SAMPLE, MOCK_PROFILE_BIO_MAX_CHARS } from "./constants";

function CameraGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

type ProfileHeroEditProps = {
  /** Resolved image URL for display (mock overrides genesis/settings). */
  profileAvatarSrc: string | null;
  /** Whether the visible avatar comes from mock local storage (show reset). */
  hasMockAvatarOverride: boolean;
  displayName: string;
  handleLine: string;
  rootOrg: string | null;
};

/**
 * Avatar change (mock) + bio add/edit in the hero card — name/handle span full width; photo is paired with the bio
 * card (vertically centered beside it).
 */
export function ProfileHeroEdit({
  profileAvatarSrc,
  hasMockAvatarOverride,
  displayName,
  handleLine,
  rootOrg,
}: ProfileHeroEditProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bioId = useId();
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [bioEditing, setBioEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState(() => getMockProfileBio() ?? "");
  const [savedBio, setSavedBio] = useState(() => getMockProfileBio());

  useEffect(() => {
    function sync() {
      const b = getMockProfileBio();
      setSavedBio(b);
      if (!bioEditing) {
        setBioDraft(b ?? "");
      }
    }
    window.addEventListener(MOCK_IDENTITY_CHANGED_EVENT, sync);
    return () => window.removeEventListener(MOCK_IDENTITY_CHANGED_EVENT, sync);
  }, [bioEditing]);

  const onAvatarFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setAvatarError(null);
    if (!file) return;
    if (file.type && !isProfileImageMimeAllowedForCore(file.type)) {
      setAvatarError("Use PNG, JPEG, WebP, or GIF.");
      return;
    }
    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      setAvatarError(`Max ${PROFILE_IMAGE_MAX_BYTES / 1024} KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result;
      if (typeof data !== "string") return;
      const head = /^data:([^;,]+)/i.exec(data);
      const mime = head ? normalizeProfileImageMimeForCore(head[1]) : "";
      if (!isProfileImageMimeAllowedForCore(mime)) {
        setAvatarError("Use PNG, JPEG, WebP, or GIF.");
        return;
      }
      setMockProfileAvatarDataUrl(data);
      notifyMockIdentityChanged();
    };
    reader.readAsDataURL(file);
  }, []);

  function saveBio() {
    const t = bioDraft.slice(0, MOCK_PROFILE_BIO_MAX_CHARS).trim();
    setMockProfileBio(t);
    setSavedBio(t || null);
    setBioEditing(false);
    notifyMockIdentityChanged();
  }

  function cancelBioEdit() {
    setBioDraft(savedBio ?? "");
    setBioEditing(false);
  }

  function clearMockAvatar() {
    setMockProfileAvatarDataUrl("");
    setAvatarError(null);
    notifyMockIdentityChanged();
  }

  const bioLen = bioDraft.length;

  return (
    <div className="relative border-b border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/30 px-6 py-10 sm:px-10">
      <div className="w-full space-y-5">
        <div className="text-left">
          <p className="font-modulr-display text-xl font-bold text-[var(--modulr-text)] sm:text-2xl">{displayName}</p>
          <p className="mt-1 font-mono text-xs text-[var(--modulr-text-muted)] sm:text-sm">{handleLine}</p>
        </div>

        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
            Public on the network
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--modulr-text-muted)]">
            Your profile photo and bio are visible to anyone on the network. Only add what you are comfortable sharing
            publicly.
          </p>
        </div>

        <div className="flex flex-row items-stretch gap-4 sm:gap-6">
          <div className="relative flex shrink-0 flex-col justify-center self-stretch">
            <div
              className="flex size-24 items-center justify-center overflow-hidden rounded-2xl border-2 border-[var(--modulr-accent)]/35 bg-[var(--modulr-glass-fill)] text-2xl font-bold text-[var(--modulr-text-muted)] shadow-lg sm:size-32 sm:text-3xl"
              aria-hidden={!!profileAvatarSrc}
            >
              {profileAvatarSrc ? (
                <img src={profileAvatarSrc} alt="" className="size-full object-cover" />
              ) : (
                "?"
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={PROFILE_IMAGE_FILE_ACCEPT}
              className="sr-only"
              aria-label="Change profile photo"
              onChange={onAvatarFile}
            />
            <button
              type="button"
              className="absolute -bottom-1 -right-1 flex size-10 items-center justify-center rounded-full border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/95 text-[var(--modulr-text)] shadow-md transition-colors hover:border-[var(--modulr-accent)]/50 hover:text-[var(--modulr-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)]"
              title="Change photo"
              aria-label="Change profile photo"
              onClick={() => fileInputRef.current?.click()}
            >
              <CameraGlyph className="size-5" />
            </button>
            {hasMockAvatarOverride ? (
              <button
                type="button"
                className="absolute -left-1 top-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[var(--modulr-text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--modulr-text)]"
                onClick={clearMockAvatar}
              >
                Reset
              </button>
            ) : null}
            {avatarError ? (
              <p className="absolute left-0 top-full mt-2 max-w-[200px] text-[10px] font-medium text-red-500/95" role="alert">
                {avatarError}
              </p>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 text-left">
            <div
              className={`flex min-h-[14rem] flex-col overflow-hidden rounded-xl border bg-[var(--modulr-glass-fill)]/40 ${
                bioEditing || savedBio
                  ? "border-[var(--modulr-glass-border)]"
                  : "border-dashed border-[var(--modulr-glass-border)]"
              }`}
            >
              {bioEditing ? (
                <>
                  <label className="sr-only" htmlFor={bioId}>
                    Public bio
                  </label>
                  <textarea
                    id={bioId}
                    value={bioDraft}
                    onChange={(e) => setBioDraft(e.target.value)}
                    maxLength={MOCK_PROFILE_BIO_MAX_CHARS}
                    placeholder="Optional. What you work on, skills, links — this text is public."
                    rows={12}
                    className="min-h-[12rem] w-full flex-1 resize-y border-0 bg-transparent px-4 py-3 text-sm leading-relaxed text-[var(--modulr-text)] outline-none ring-0 placeholder:text-[var(--modulr-text-muted)] focus:ring-0"
                  />
                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--modulr-glass-border)] px-4 py-3">
                    <span className="mr-auto text-[10px] text-[var(--modulr-text-muted)]">
                      {Math.min(bioLen, MOCK_PROFILE_BIO_MAX_CHARS)} / {MOCK_PROFILE_BIO_MAX_CHARS}
                    </span>
                    <button
                      type="button"
                      onClick={saveBio}
                      className="rounded-lg bg-[var(--modulr-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--modulr-accent-contrast)]"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelBioEdit}
                      className="rounded-lg border border-[var(--modulr-glass-border)] px-3 py-1.5 text-xs font-semibold text-[var(--modulr-text-muted)] hover:text-[var(--modulr-text)]"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : savedBio ? (
                <div className="flex min-h-[12rem] flex-col p-4">
                  <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--modulr-text)]">{savedBio}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setBioDraft(savedBio);
                      setBioEditing(true);
                    }}
                    className="mt-3 self-start text-xs font-semibold text-[var(--modulr-accent)] hover:underline"
                  >
                    Edit bio
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setBioDraft(MOCK_PROFILE_BIO_DEV_SAMPLE.slice(0, MOCK_PROFILE_BIO_MAX_CHARS));
                    setBioEditing(true);
                  }}
                  className="flex min-h-[12rem] w-full flex-col justify-center px-4 py-4 text-left transition-colors hover:bg-[var(--modulr-page-bg)]/15"
                >
                  <span className="font-medium text-[var(--modulr-accent)]">Add a bio</span>
                  <span className="mt-2 text-xs leading-relaxed text-[var(--modulr-text-muted)]">
                    Optional. Describe what you do — this text is public.
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {rootOrg ? (
          <p className="text-xs text-[var(--modulr-text-muted)]">
            Root org context from Core:{" "}
            <span className="font-mono text-[var(--modulr-text)]">{rootOrg}</span>
          </p>
        ) : null}

        <p className="modulr-text-muted border-t border-[var(--modulr-glass-border)] pt-4 text-[10px] leading-relaxed">
          <button
            type="button"
            className="font-medium text-[var(--modulr-text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--modulr-text)]"
            onClick={() => {
              clearMockNetworkHandle();
              clearMockOrganizationKey();
              setShellSignedIn(false);
              notifyMockIdentityChanged();
            }}
          >
            Clear mock identity (demo)
          </button>
          {" · "}
          Removes handle, photo, public bio, and org keys stored in this browser.
        </p>
      </div>
    </div>
  );
}

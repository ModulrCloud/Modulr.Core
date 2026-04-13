"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAppUi } from "@/components/providers/AppProviders";
import {
  postGenesisChallenge,
  postGenesisChallengeVerify,
  postGenesisComplete,
} from "@/lib/coreApi";
import { formatClientError } from "@/lib/formatClientError";
import { PROFILE_IMAGE_MAX_BYTES } from "@/lib/settings";

/**
 * 1 intro · 2 root org + logo · 3 operator profile image + pubkey + username · 4 challenge · 5 complete.
 */
export const GENESIS_WIZARD_STEP_COUNT = 5;

function formatNetworkEnv(env: string | undefined): string {
  if (!env) return "Unknown";
  const m: Record<string, string> = {
    local: "Local",
    testnet: "Testnet",
    production: "Production",
  };
  return m[env] ?? env;
}

/** Matches Core `validate_genesis_root_organization_label` (single segment, max length). */
const ROOT_ORG_LABEL_MAX_LEN = 63;

const fieldLabel = "mb-1.5 block text-xs font-medium tracking-wide text-[var(--modulr-text-muted)]";
const inputCls =
  "w-full rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2.5 text-sm text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2";

type Props = {
  open: boolean;
  onDismiss: () => void;
  /** From Core `GET /version` → `network_environment` (`local` | `testnet` | `production`). */
  networkEnvironment?: string;
  /** Primary Core base URL (Settings) for `POST /genesis/challenge` and `…/verify`. */
  coreBaseUrl?: string;
  /** When `false`, genesis HTTP routes return 403 — step 4 cannot issue or verify. */
  genesisOperationsAllowed?: boolean;
  /** After `POST /genesis/complete` succeeds — refetch `/version` so the shell hides the wizard. */
  onGenesisCompleteSuccess?: () => void;
};

function formatChallengeRemaining(sec: number): string {
  if (sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Ed25519 public key hex: 64 hex chars after stripping non-hex. */
function isEd25519PubkeyHex(s: string): boolean {
  return s.replace(/[^0-9a-fA-F]/g, "").length === 64;
}

/**
 * Clipboard API is only available in secure contexts (HTTPS or http://localhost).
 * On plain HTTP with another host (e.g. LAN IP), `navigator.clipboard` is undefined — use fallback.
 */
async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* fall through to execCommand (e.g. permission denied) */
    }
  }
  if (typeof document === "undefined") {
    throw new Error("Clipboard is not available in this environment.");
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    const ok = document.execCommand("copy");
    if (!ok) {
      throw new Error(
        "Could not copy automatically. Select the challenge text and press Ctrl+C (Cmd+C on Mac).",
      );
    }
  } finally {
    document.body.removeChild(ta);
  }
}

/** Extract base64 + MIME from a `data:image/...;base64,...` URL for `POST /genesis/complete`. */
function dataUrlToBase64Payload(dataUrl: string): { base64: string; mime: string } | null {
  const m = /^data:([^;,]+)(?:;[^;,]+)*;base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1].trim().toLowerCase();
  const base64 = m[2].replace(/\s/g, "");
  if (!mime || !base64) return null;
  return { mime, base64 };
}

/** Genesis wizard when Core reports `genesis_complete: false` (lab / first boot). */
export function GenesisNoticeModal({
  open,
  onDismiss,
  networkEnvironment,
  coreBaseUrl,
  genesisOperationsAllowed,
  onGenesisCompleteSuccess,
}: Props) {
  const { settings, setSettings } = useAppUi();
  const [currentStep, setCurrentStep] = useState(1);
  /** Display label for this network / root org (wired to complete later). */
  const [networkLabel, setNetworkLabel] = useState("Modulr");
  const [operatorPubkeyHex, setOperatorPubkeyHex] = useState("");
  const [operatorDisplayName, setOperatorDisplayName] = useState("");
  /** Ed25519 hex for `root_organization_signing_public_key_hex` on complete (often same as username key). */
  const [orgSigningPubkeyHex, setOrgSigningPubkeyHex] = useState("");
  /** Step 4 — `POST /genesis/challenge` + verify (consumed challenge id kept for step 5 / complete). */
  const [genesisChallengeId, setGenesisChallengeId] = useState<string | null>(null);
  const [genesisChallengeBody, setGenesisChallengeBody] = useState("");
  const [genesisChallengeExpiresAtUnix, setGenesisChallengeExpiresAtUnix] = useState<number | null>(
    null,
  );
  const [genesisChallengeSignatureHex, setGenesisChallengeSignatureHex] = useState("");
  const [genesisChallengeVerified, setGenesisChallengeVerified] = useState(false);
  const [genesisIssueLoading, setGenesisIssueLoading] = useState(false);
  const [genesisVerifyLoading, setGenesisVerifyLoading] = useState(false);
  const [genesisStep4Error, setGenesisStep4Error] = useState<string | null>(null);
  const [genesisCompleteLoading, setGenesisCompleteLoading] = useState(false);
  const [genesisCompleteError, setGenesisCompleteError] = useState<string | null>(null);
  const [challengeCountdownTick, setChallengeCountdownTick] = useState(0);
  /** Brief UX after Copy body succeeds. */
  const [challengeBodyCopyFeedback, setChallengeBodyCopyFeedback] = useState(false);
  /** Optional SVG logo for the root org — persisted on `POST /genesis/complete`. */
  const [networkLogoObjectUrl, setNetworkLogoObjectUrl] = useState<string | null>(null);
  const [networkLogoSvgText, setNetworkLogoSvgText] = useState<string | null>(null);
  const [networkLogoFileName, setNetworkLogoFileName] = useState<string | null>(null);
  const [operatorAvatarError, setOperatorAvatarError] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const operatorAvatarInputRef = useRef<HTMLInputElement>(null);
  const challengeBodyCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetGenesisChallengeState = useCallback(() => {
    setGenesisChallengeId(null);
    setGenesisChallengeBody("");
    setGenesisChallengeExpiresAtUnix(null);
    setGenesisChallengeSignatureHex("");
    setGenesisChallengeVerified(false);
    setGenesisIssueLoading(false);
    setGenesisVerifyLoading(false);
    setGenesisStep4Error(null);
    setGenesisCompleteError(null);
    setGenesisCompleteLoading(false);
    setChallengeBodyCopyFeedback(false);
    if (challengeBodyCopyTimerRef.current) {
      clearTimeout(challengeBodyCopyTimerRef.current);
      challengeBodyCopyTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setCurrentStep(1);
    setNetworkLabel("Modulr");
    setOperatorPubkeyHex("");
    setOperatorDisplayName("");
    setOrgSigningPubkeyHex("");
    resetGenesisChallengeState();
    setNetworkLogoObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setNetworkLogoSvgText(null);
    setNetworkLogoFileName(null);
    if (logoFileInputRef.current) logoFileInputRef.current.value = "";
    setOperatorAvatarError(null);
    if (operatorAvatarInputRef.current) operatorAvatarInputRef.current.value = "";
  }, [open, resetGenesisChallengeState]);

  useEffect(() => {
    if (!open) return;
    resetGenesisChallengeState();
  }, [operatorPubkeyHex, open, resetGenesisChallengeState]);

  useEffect(() => {
    if (
      !open ||
      currentStep !== 4 ||
      genesisChallengeExpiresAtUnix == null ||
      genesisChallengeVerified
    ) {
      return;
    }
    const id = window.setInterval(() => {
      setChallengeCountdownTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, currentStep, genesisChallengeExpiresAtUnix, genesisChallengeVerified]);

  useEffect(() => {
    return () => {
      if (challengeBodyCopyTimerRef.current) {
        clearTimeout(challengeBodyCopyTimerRef.current);
      }
    };
  }, []);

  if (!open) return null;

  /** Tier only — same source as CLI/config `network_environment` on `GET /version`. */
  const networkModeLabel = formatNetworkEnv(networkEnvironment);
  /** Shown in copy — updates as the user edits the root organization name field. */
  const rootOrgDisplayName = networkLabel.trim() || "Modulr";
  /** Core rejects ``.`` in root org name (single segment only). */
  const rootOrgNameHasDot = networkLabel.includes(".");
  const step3BothFilled =
    operatorPubkeyHex.trim().length > 0 &&
    operatorDisplayName.trim().length > 0 &&
    Boolean(settings.profileAvatarDataUrl?.trim());

  function goBack() {
    setCurrentStep((s) => Math.max(1, s - 1));
  }

  function goNext() {
    setCurrentStep((s) => Math.min(GENESIS_WIZARD_STEP_COUNT, s + 1));
  }

  function onNetworkLogoFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const okType =
      file.type === "image/svg+xml" ||
      file.type === "image/svg" ||
      file.name.toLowerCase().endsWith(".svg");
    if (!okType) {
      e.target.value = "";
      return;
    }
    setNetworkLogoObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setNetworkLogoFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const t = reader.result;
      if (typeof t === "string") {
        setNetworkLogoSvgText(t);
      }
    };
    reader.readAsText(file);
  }

  function clearNetworkLogo() {
    setNetworkLogoObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setNetworkLogoSvgText(null);
    setNetworkLogoFileName(null);
    if (logoFileInputRef.current) logoFileInputRef.current.value = "";
  }

  function onOperatorProfileImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setOperatorAvatarError("Choose an image file.");
      return;
    }
    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      setOperatorAvatarError(
        `Image must be ${PROFILE_IMAGE_MAX_BYTES / 1024} KB or smaller.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result;
      if (typeof data !== "string") return;
      setSettings((s) => ({ ...s, profileAvatarDataUrl: data }));
      setOperatorAvatarError(null);
    };
    reader.readAsDataURL(file);
  }

  function clearOperatorProfileImage() {
    setSettings((s) => ({ ...s, profileAvatarDataUrl: "" }));
    setOperatorAvatarError(null);
    if (operatorAvatarInputRef.current) operatorAvatarInputRef.current.value = "";
  }

  const coreBaseTrimmed = coreBaseUrl?.trim() ?? "";
  const genesisOpsBlocked = genesisOperationsAllowed === false;
  const nowUnixSec = Math.floor(Date.now() / 1000);
  void challengeCountdownTick;
  const challengeRemainingSec =
    genesisChallengeExpiresAtUnix != null
      ? Math.max(0, genesisChallengeExpiresAtUnix - nowUnixSec)
      : 0;
  const challengeExpired =
    genesisChallengeExpiresAtUnix != null &&
    !genesisChallengeVerified &&
    nowUnixSec >= genesisChallengeExpiresAtUnix;

  async function handleGenesisIssueChallenge() {
    if (!coreBaseTrimmed) {
      setGenesisStep4Error("Configure a Core base URL in Settings.");
      return;
    }
    if (genesisOpsBlocked) return;
    const pk = operatorPubkeyHex.trim();
    if (!pk) {
      setGenesisStep4Error("Public key from step 3 is required.");
      return;
    }
    setGenesisStep4Error(null);
    setGenesisIssueLoading(true);
    try {
      const out = await postGenesisChallenge(coreBaseTrimmed, pk);
      setGenesisChallengeId(out.challenge_id);
      setGenesisChallengeBody(out.challenge_body);
      setGenesisChallengeExpiresAtUnix(out.expires_at_unix);
      setGenesisChallengeVerified(false);
      setGenesisChallengeSignatureHex("");
    } catch (e: unknown) {
      setGenesisStep4Error(formatClientError(e));
    } finally {
      setGenesisIssueLoading(false);
    }
  }

  async function handleGenesisVerifyChallenge() {
    if (!coreBaseTrimmed || !genesisChallengeId) return;
    if (genesisOpsBlocked) return;
    const sig = genesisChallengeSignatureHex
      .replace(/[^0-9a-fA-F]/g, "")
      .toLowerCase();
    if (sig.length !== 128) {
      setGenesisStep4Error(
        "Signature must be 128 hex characters (64 bytes). Remove spaces or line breaks if you pasted from Keymaster.",
      );
      return;
    }
    setGenesisStep4Error(null);
    setGenesisVerifyLoading(true);
    try {
      await postGenesisChallengeVerify(coreBaseTrimmed, genesisChallengeId, sig);
      setGenesisChallengeVerified(true);
    } catch (e: unknown) {
      setGenesisStep4Error(formatClientError(e));
    } finally {
      setGenesisVerifyLoading(false);
    }
  }

  async function copyGenesisChallengeBody() {
    if (!genesisChallengeBody) return;
    try {
      await copyTextToClipboard(genesisChallengeBody);
      setGenesisStep4Error(null);
      setChallengeBodyCopyFeedback(true);
      if (challengeBodyCopyTimerRef.current) {
        clearTimeout(challengeBodyCopyTimerRef.current);
      }
      challengeBodyCopyTimerRef.current = setTimeout(() => {
        setChallengeBodyCopyFeedback(false);
        challengeBodyCopyTimerRef.current = null;
      }, 2500);
    } catch (e: unknown) {
      setGenesisStep4Error(formatClientError(e));
    }
  }

  async function handleGenesisComplete() {
    if (!coreBaseTrimmed || !genesisChallengeId) return;
    if (genesisOpsBlocked) return;
    const rootName = networkLabel.trim();
    if (!rootName || rootOrgNameHasDot) {
      setGenesisCompleteError("Fix the root organization name before completing.");
      return;
    }
    if (!isEd25519PubkeyHex(operatorPubkeyHex) || !isEd25519PubkeyHex(orgSigningPubkeyHex)) {
      setGenesisCompleteError(
        "Username and organization signing keys must each be 64 hex characters (Ed25519 public key).",
      );
      return;
    }
    setGenesisCompleteError(null);
    setGenesisCompleteLoading(true);
    try {
      const profileUrl = settings.profileAvatarDataUrl?.trim();
      const profileParts = profileUrl ? dataUrlToBase64Payload(profileUrl) : null;
      const svgTrim = networkLogoSvgText?.trim();
      await postGenesisComplete(coreBaseTrimmed, {
        challenge_id: genesisChallengeId.toLowerCase(),
        subject_signing_pubkey_hex: operatorPubkeyHex.replace(/[^0-9a-fA-F]/g, "").toLowerCase(),
        root_organization_name: rootName,
        root_organization_signing_public_key_hex: orgSigningPubkeyHex
          .replace(/[^0-9a-fA-F]/g, "")
          .toLowerCase(),
        operator_display_name: operatorDisplayName.trim() || undefined,
        root_organization_logo_svg: svgTrim && svgTrim.toLowerCase().includes("<svg") ? svgTrim : undefined,
        bootstrap_operator_profile_image_base64: profileParts?.base64,
        bootstrap_operator_profile_image_mime: profileParts?.mime,
      });
      onGenesisCompleteSuccess?.();
    } catch (e: unknown) {
      setGenesisCompleteError(formatClientError(e));
    } finally {
      setGenesisCompleteLoading(false);
    }
  }

  const backDisabled = currentStep <= 1 || genesisCompleteLoading;
  const primaryFooterDisabled =
    genesisCompleteLoading ||
    (currentStep === 2 && rootOrgNameHasDot) ||
    (currentStep === 3 && !step3BothFilled) ||
    (currentStep === 4 && !genesisChallengeVerified) ||
    (currentStep === 5 &&
      (genesisOpsBlocked ||
        !genesisChallengeId ||
        !isEd25519PubkeyHex(operatorPubkeyHex) ||
        !isEd25519PubkeyHex(orgSigningPubkeyHex) ||
        !networkLabel.trim() ||
        rootOrgNameHasDot));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="genesis-notice-title"
      aria-describedby="genesis-wizard-step-label"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="Dismiss genesis notice"
        onClick={onDismiss}
      />
      <div
        className="modulr-glass-surface relative z-10 flex w-[80vw] h-[65vh] min-h-0 flex-col rounded-2xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] shadow-2xl"
        style={{
          boxShadow:
            "0 24px 64px rgba(0,0,0,0.25), inset 0 1px 0 var(--modulr-glass-highlight)",
        }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--modulr-glass-border)] px-6 py-4">
          <div className="min-w-0">
            <h2
              id="genesis-notice-title"
              className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]"
            >
              Genesis
            </h2>
            <p className="mt-1 text-xs leading-snug text-[var(--modulr-text-muted)]">
              Network mode:{" "}
              <span className="font-semibold text-[var(--modulr-text)]">{networkModeLabel}</span>
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-[var(--modulr-text-muted)] hover:bg-[var(--modulr-glass-highlight)] hover:text-[var(--modulr-text)]"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </header>

        <div className="modulr-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {currentStep === 1 && (
            <div className="space-y-5">
              <p className="text-base font-medium leading-relaxed text-[var(--modulr-text)]">
                Welcome to {rootOrgDisplayName} — this network has not been initialized yet.
              </p>
              <p className="text-sm leading-relaxed text-[var(--modulr-text-muted)]">
                You are seeing this because{" "}
                <strong className="font-semibold text-[var(--modulr-text)]">genesis</strong> has not
                run: the Core deployment you are connected to still needs its one-time setup.
                That setup registers your network on the chain of trust, creates the{" "}
                <strong className="font-semibold text-[var(--modulr-text)]">first organization</strong>
                , and establishes the{" "}
                <strong className="font-semibold text-[var(--modulr-text)]">first operator</strong> —
                your bootstrap identity on this network until others are invited.
              </p>
              <p className="text-sm leading-relaxed text-[var(--modulr-text-muted)]">
                The next screens walk you through naming and branding, operator keys, verification,
                and final confirmation — so you can bring this network online with confidence.
              </p>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-5">
              <p className="text-base font-medium text-[var(--modulr-text)]">Root organization</p>
              <p className="text-sm text-[var(--modulr-text-muted)]">
                Choose a <strong className="text-[var(--modulr-text)]">single</strong> name and an
                optional SVG logo. One segment like{" "}
                <span className="font-mono text-[var(--modulr-text)]">modulr</span>, not{" "}
                <span className="font-mono text-[var(--modulr-text)]">team.example</span> — this root
                anchors trust for <strong className="text-[var(--modulr-text)]">all</strong>{" "}
                subdomains and child orgs on this network. Emoji are OK in the name; Core accepts
                them as part of this single segment.
              </p>
              <div>
                <label htmlFor="genesis-network-label" className={fieldLabel}>
                  Root organization name
                </label>
                <input
                  id="genesis-network-label"
                  type="text"
                  autoComplete="off"
                  maxLength={ROOT_ORG_LABEL_MAX_LEN}
                  value={networkLabel}
                  onChange={(e) => setNetworkLabel(e.target.value)}
                  aria-invalid={rootOrgNameHasDot}
                  aria-describedby={
                    rootOrgNameHasDot
                      ? "genesis-root-org-dot-error genesis-root-org-hint"
                      : "genesis-root-org-hint"
                  }
                  className={`${inputCls} ${
                    rootOrgNameHasDot ? "border-red-400/70 ring-2 ring-red-400/30" : ""
                  }`}
                  placeholder="modulr"
                />
                {rootOrgNameHasDot ? (
                  <p
                    id="genesis-root-org-dot-error"
                    role="alert"
                    className="mt-2 text-xs font-medium leading-snug text-red-400/90"
                  >
                    A dot (.) isn&apos;t allowed here — this must be one segment only, not
                    team.example or domain.subdomain. The root org you create owns naming under this
                    entire network, so a single label is required for security and clarity.
                  </p>
                ) : null}
                <p
                  id="genesis-root-org-hint"
                  className="mt-1.5 text-xs leading-snug text-[var(--modulr-text-muted)]"
                >
                  Up to {ROOT_ORG_LABEL_MAX_LEN} characters, one segment (no dots). Letters,
                  numbers, emoji, and spaces are fine — Core lowercases letters for consistency.
                  Avoid &quot;domain.subdomain&quot; patterns; this name is the root for the whole tree
                  under this network.
                </p>
              </div>

              <div className="border-t border-[var(--modulr-glass-border)] pt-5">
                <p className="mb-3 text-sm text-[var(--modulr-text-muted)]">
                  Optional: add an <strong className="text-[var(--modulr-text)]">SVG logo</strong>{" "}
                  for this root organization (shown in the shell when wired to Core). Preview only for
                  now — upload is not persisted yet.
                </p>
                <label htmlFor="genesis-network-logo" className={fieldLabel}>
                  Root organization logo (SVG)
                </label>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <input
                      ref={logoFileInputRef}
                      id="genesis-network-logo"
                      type="file"
                      accept=".svg,image/svg+xml"
                      className="block w-full text-xs text-[var(--modulr-text-muted)] file:mr-3 file:rounded-lg file:border file:border-[var(--modulr-glass-border)] file:bg-[var(--modulr-glass-fill)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--modulr-text)]"
                      onChange={onNetworkLogoFileChange}
                    />
                    {networkLogoFileName ? (
                      <p className="mt-1 truncate text-xs text-[var(--modulr-text-muted)]">
                        {networkLogoFileName}
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--modulr-glass-border)] bg-black/20"
                    aria-hidden={!networkLogoObjectUrl}
                  >
                    {networkLogoObjectUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- blob: SVG preview
                      <img
                        src={networkLogoObjectUrl}
                        alt=""
                        className="max-h-full max-w-full object-contain p-1"
                      />
                    ) : (
                      <span className="px-2 text-center text-[10px] text-[var(--modulr-text-muted)]">
                        Preview
                      </span>
                    )}
                  </div>
                </div>
                {networkLogoObjectUrl ? (
                  <button
                    type="button"
                    onClick={clearNetworkLogo}
                    className="mt-2 text-xs font-medium text-[var(--modulr-text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--modulr-text)]"
                  >
                    Remove logo
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-[var(--modulr-text-muted)]">
                Add a <strong className="text-[var(--modulr-text)]">profile picture</strong> for
                this bootstrap operator (stored in this browser until Core can persist avatars). Then
                enter the Ed25519 <strong className="text-[var(--modulr-text)]">public key</strong>{" "}
                (hex) and <strong className="text-[var(--modulr-text)]">username</strong>. Private
                keys stay in Keymaster — paste only the public key here.
              </p>
              <div className="border-t border-[var(--modulr-glass-border)] pt-4">
                <p className={`${fieldLabel} mb-3`}>Profile picture</p>
                <div className="flex flex-wrap items-start gap-4">
                  <div
                    className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--modulr-glass-border)] bg-black/20"
                    aria-hidden={!settings.profileAvatarDataUrl}
                  >
                    {settings.profileAvatarDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data URL from user file
                      <img
                        src={settings.profileAvatarDataUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="px-2 text-center text-[10px] text-[var(--modulr-text-muted)]">
                        No image
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      ref={operatorAvatarInputRef}
                      id="genesis-operator-avatar"
                      type="file"
                      accept="image/*"
                      className="block w-full text-xs text-[var(--modulr-text-muted)] file:mr-3 file:rounded-lg file:border file:border-[var(--modulr-glass-border)] file:bg-[var(--modulr-glass-fill)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--modulr-text)]"
                      onChange={onOperatorProfileImageChange}
                    />
                    {operatorAvatarError ? (
                      <p className="text-xs font-medium text-red-400/90" role="alert">
                        {operatorAvatarError}
                      </p>
                    ) : (
                      <p className="text-[10px] leading-snug text-[var(--modulr-text-muted)]">
                        Required to continue. Max {PROFILE_IMAGE_MAX_BYTES / 1024} KB (PNG, JPEG,
                        WebP, etc.).
                      </p>
                    )}
                    {settings.profileAvatarDataUrl ? (
                      <button
                        type="button"
                        onClick={clearOperatorProfileImage}
                        className="text-xs font-medium text-[var(--modulr-text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--modulr-text)]"
                      >
                        Remove picture
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="genesis-username-pk" className={fieldLabel}>
                  Public key (hex)
                </label>
                <textarea
                  id="genesis-username-pk"
                  value={operatorPubkeyHex}
                  onChange={(e) => setOperatorPubkeyHex(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  className={`${inputCls} font-mono text-xs leading-relaxed`}
                  placeholder="64 hex characters (paste from Keymaster)"
                />
              </div>
              <div>
                <label htmlFor="genesis-username-display" className={fieldLabel}>
                  Username
                </label>
                <input
                  id="genesis-username-display"
                  type="text"
                  autoComplete="username"
                  value={operatorDisplayName}
                  onChange={(e) => setOperatorDisplayName(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. alex — initial admin"
                />
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <p className="text-base font-medium text-[var(--modulr-text)]">Sign the challenge</p>
              <p className="text-sm leading-relaxed text-[var(--modulr-text-muted)]">
                Core issues a one-time challenge bound to your{" "}
                <strong className="text-[var(--modulr-text)]">username public key</strong> from step 3.
                Copy the challenge into Keymaster (
                <span className="font-mono text-[10px]">Sign challenge</span>), sign with the{" "}
                <strong className="text-[var(--modulr-text)]">same identity</strong> whose public key
                you pasted in step 3, then paste the{" "}
                <strong className="text-[var(--modulr-text)]">128-character hex</strong> signature here.
                Core verifies with{" "}
                <span className="font-mono text-xs">POST /genesis/challenge/verify</span>.
              </p>
              <p className="text-xs leading-snug text-[var(--modulr-text-muted)]">
                If verification fails: (1) the step 3 public key must be the same identity you sign
                with in Keymaster; (2) use <strong className="text-[var(--modulr-text)]">Copy body</strong>{" "}
                / <strong className="text-[var(--modulr-text)]">Copy signature</strong> — selecting
                text by hand can introduce Windows CRLF line endings or a one-character typo in the
                128 hex chars; (3) Keymaster normalizes CRLF to match Core&apos;s line feeds and strips
                trailing junk on the challenge paste.
              </p>

              {!coreBaseTrimmed ? (
                <p className="text-sm font-medium text-amber-400/90" role="status">
                  Add a Core base URL in Settings to issue a challenge.
                </p>
              ) : null}
              {genesisOpsBlocked ? (
                <p className="text-sm font-medium text-amber-400/90" role="status">
                  This deployment does not allow genesis operations (
                  <span className="font-mono">genesis_operations_allowed: false</span>). Use a
                  local or testnet Core with genesis enabled.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    !coreBaseTrimmed ||
                    genesisOpsBlocked ||
                    genesisIssueLoading ||
                    !operatorPubkeyHex.trim()
                  }
                  onClick={handleGenesisIssueChallenge}
                  className={
                    !coreBaseTrimmed || genesisOpsBlocked || !operatorPubkeyHex.trim()
                      ? "rounded-lg border border-[var(--modulr-glass-border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--modulr-text-muted)] opacity-50 cursor-not-allowed"
                      : "rounded-lg border border-[var(--modulr-accent)]/40 bg-[var(--modulr-accent)]/15 px-4 py-2 text-sm font-semibold text-[var(--modulr-accent)] transition-colors hover:bg-[var(--modulr-accent)]/25"
                  }
                >
                  {genesisIssueLoading ? "Issuing…" : genesisChallengeId ? "Issue new challenge" : "Issue challenge"}
                </button>
                {genesisChallengeId && genesisChallengeExpiresAtUnix != null ? (
                  <span className="text-xs text-[var(--modulr-text-muted)]">
                    {genesisChallengeVerified ? (
                      <span className="font-medium text-emerald-400/90">Challenge verified.</span>
                    ) : challengeExpired ? (
                      <span className="font-medium text-amber-400/90">
                        Expired (this device&apos;s clock) — you can still verify; Core decides.
                      </span>
                    ) : (
                      <>
                        Expires in{" "}
                        <span className="font-mono text-[var(--modulr-text)]">
                          {formatChallengeRemaining(challengeRemainingSec)}
                        </span>
                      </>
                    )}
                  </span>
                ) : null}
              </div>

              {genesisChallengeId ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <label htmlFor="genesis-challenge-body" className={fieldLabel}>
                      Challenge body (Core stores this exact UTF-8 text)
                    </label>
                    <button
                      type="button"
                      onClick={copyGenesisChallengeBody}
                      className={
                        challengeBodyCopyFeedback
                          ? "text-xs font-semibold text-emerald-400/95"
                          : "text-xs font-medium text-[var(--modulr-accent)] underline decoration-dotted underline-offset-2 hover:opacity-90"
                      }
                      aria-label={
                        challengeBodyCopyFeedback
                          ? "Challenge body copied to clipboard"
                          : "Copy challenge body to clipboard"
                      }
                    >
                      <span aria-live="polite">{challengeBodyCopyFeedback ? "Copied" : "Copy body"}</span>
                    </button>
                  </div>
                  <textarea
                    id="genesis-challenge-body"
                    readOnly
                    value={genesisChallengeBody}
                    rows={8}
                    spellCheck={false}
                    className={`${inputCls} font-mono text-xs leading-relaxed opacity-95`}
                  />
                  <p className="text-xs text-[var(--modulr-text-muted)]">
                    <span className="font-mono">challenge_id</span> (nonce):{" "}
                    <span className="break-all font-mono text-[11px] text-[var(--modulr-text)]">
                      {genesisChallengeId}
                    </span>
                  </p>
                </div>
              ) : null}

              {genesisChallengeId && !genesisChallengeVerified ? (
                <div className="space-y-2">
                  <label htmlFor="genesis-challenge-sig" className={fieldLabel}>
                    Signature (hex)
                  </label>
                  <textarea
                    id="genesis-challenge-sig"
                    value={genesisChallengeSignatureHex}
                    onChange={(e) => setGenesisChallengeSignatureHex(e.target.value)}
                    rows={3}
                    spellCheck={false}
                    disabled={genesisVerifyLoading}
                    className={`${inputCls} font-mono text-xs leading-relaxed`}
                    placeholder="128 hex characters from Keymaster"
                  />
                  <button
                    type="button"
                    disabled={
                      genesisOpsBlocked ||
                      genesisVerifyLoading ||
                      genesisChallengeSignatureHex.replace(/[^0-9a-fA-F]/g, "").length < 128
                    }
                    onClick={handleGenesisVerifyChallenge}
                    className={
                      genesisOpsBlocked ||
                      genesisVerifyLoading ||
                      genesisChallengeSignatureHex.replace(/[^0-9a-fA-F]/g, "").length < 128
                        ? "rounded-lg border border-[var(--modulr-glass-border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--modulr-text-muted)] opacity-50 cursor-not-allowed"
                        : "rounded-lg border border-[var(--modulr-accent)]/40 bg-[var(--modulr-accent)]/15 px-4 py-2 text-sm font-semibold text-[var(--modulr-accent)] transition-colors hover:bg-[var(--modulr-accent)]/25"
                    }
                  >
                    {genesisVerifyLoading ? "Verifying…" : "Verify signature"}
                  </button>
                </div>
              ) : null}

              {genesisChallengeVerified ? (
                <p className="text-sm font-medium text-emerald-400/90" role="status">
                  Signature verified. Use <strong className="font-semibold">Next</strong> to finish
                  genesis on the following step.
                </p>
              ) : null}

              {genesisStep4Error ? (
                <p
                  className="text-sm font-medium text-red-400/90"
                  role="alert"
                  aria-live="polite"
                >
                  {genesisStep4Error}
                </p>
              ) : null}
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-5">
              <p className="text-base font-medium text-[var(--modulr-text)]">Complete genesis</p>
              <p className="text-sm leading-relaxed text-[var(--modulr-text-muted)]">
                This step will call{" "}
                <span className="font-mono text-xs">POST /genesis/complete</span> with your verified
                challenge, root organization name, and organization signing key. Below is a preview of
                what you&apos;ve entered.
              </p>

              <div className="rounded-xl border border-[var(--modulr-glass-border)] bg-black/15 px-4 py-3 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--modulr-text-muted)]">
                  Summary
                </p>
                <dl className="space-y-2 text-[var(--modulr-text)]">
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <dt className="text-[var(--modulr-text-muted)]">Root organization</dt>
                    <dd className="font-medium">{networkLabel.trim() || "—"}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <dt className="text-[var(--modulr-text-muted)]">Username</dt>
                    <dd className="font-medium">{operatorDisplayName.trim() || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--modulr-text-muted)]">Username public key (hex)</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-[var(--modulr-text)]">
                      {operatorPubkeyHex.trim() || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--modulr-text-muted)]">
                      <span className="font-mono">challenge_id</span> (verified)
                    </dt>
                    <dd className="mt-1 break-all font-mono text-[11px] text-[var(--modulr-text)]">
                      {genesisChallengeId?.trim() || "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <label htmlFor="genesis-org-pk" className={fieldLabel}>
                  Organization signing public key (hex)
                </label>
                <textarea
                  id="genesis-org-pk"
                  value={orgSigningPubkeyHex}
                  onChange={(e) => setOrgSigningPubkeyHex(e.target.value)}
                  rows={3}
                  spellCheck={false}
                  className={`${inputCls} font-mono text-xs leading-relaxed`}
                  placeholder="64 hex characters — often the same as the username public key for a single-org bootstrap"
                />
                <p className="mt-1.5 text-xs leading-snug text-[var(--modulr-text-muted)]">
                  Maps to <span className="font-mono">root_organization_signing_public_key_hex</span>{" "}
                  on complete. Many deployments use the same Ed25519 key as the username for the root
                  org at genesis.
                </p>
              </div>

              {genesisCompleteError ? (
                <p className="text-sm font-medium text-red-400/90" role="alert" aria-live="polite">
                  {genesisCompleteError}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <footer
          className="shrink-0 border-t border-[var(--modulr-glass-border)] px-6 py-4"
          aria-label="Wizard navigation"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <p
                className="text-xs font-semibold tracking-wide text-[var(--modulr-text)]"
                id="genesis-wizard-step-label"
              >
                Step {currentStep} of {GENESIS_WIZARD_STEP_COUNT}
              </p>
              <div className="flex items-center gap-1.5" role="presentation" aria-hidden>
                {Array.from({ length: GENESIS_WIZARD_STEP_COUNT }, (_, i) => {
                  const n = i + 1;
                  const active = n === currentStep;
                  return (
                    <span
                      key={n}
                      className={`h-2 w-2 rounded-full transition-colors ${
                        active
                          ? "bg-[var(--modulr-accent)] shadow-[0_0_8px_var(--modulr-accent)]"
                          : "bg-[var(--modulr-glass-border)] opacity-70"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <button
                type="button"
                disabled={backDisabled}
                onClick={goBack}
                className={
                  backDisabled
                    ? "rounded-lg border border-[var(--modulr-glass-border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--modulr-text-muted)] opacity-50 cursor-not-allowed"
                    : "rounded-lg border border-[var(--modulr-glass-border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--modulr-text)] hover:bg-[var(--modulr-glass-highlight)]"
                }
              >
                Back
              </button>
              <button
                type="button"
                disabled={primaryFooterDisabled}
                onClick={() => {
                  if (currentStep === GENESIS_WIZARD_STEP_COUNT) {
                    void handleGenesisComplete();
                  } else {
                    goNext();
                  }
                }}
                className={
                  primaryFooterDisabled
                    ? "rounded-lg border border-[var(--modulr-glass-border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--modulr-text-muted)] opacity-50 cursor-not-allowed"
                    : "rounded-lg border border-[var(--modulr-accent)]/40 bg-[var(--modulr-accent)]/15 px-4 py-2 text-sm font-semibold text-[var(--modulr-accent)] transition-colors hover:bg-[var(--modulr-accent)]/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)]"
                }
              >
                {currentStep >= GENESIS_WIZARD_STEP_COUNT
                  ? genesisCompleteLoading
                    ? "Completing…"
                    : "Complete"
                  : "Next"}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

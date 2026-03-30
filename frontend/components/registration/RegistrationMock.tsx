"use client";

import { useId, useMemo, useState } from "react";

import { GlassPanel } from "@/components/shell/GlassPanel";

import {
  formatMockUsd,
  mockNamePriceQuote,
  mockOrgPriceQuote,
  orgNamespaceAnchorUsd,
  type RegistrationPriceQuote,
} from "./mockRegistrationPricing";
import { type MockAvailStatus, useMockAvailability } from "./useMockAvailability";

const inputClass =
  "mt-1 w-full max-w-xl rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2.5 text-sm text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2";

function previewNameClass(): string {
  return "break-words text-lg font-semibold leading-snug text-[var(--modulr-accent)] [overflow-wrap:anywhere]";
}

function AvailabilityStrip({ status }: { status: MockAvailStatus }) {
  if (status === "idle_invalid") return null;

  const base =
    "mt-6 rounded-xl border px-4 py-3 text-sm leading-relaxed transition-colors duration-200";

  if (status === "pending") {
    return (
      <div
        className={`${base} border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/25 text-[var(--modulr-text-muted)]`}
        role="status"
        aria-live="polite"
      >
        <span className="font-medium text-[var(--modulr-text)]">Waiting</span> — pause typing for
        about a second; availability checks run automatically (mock Core round-trip).
      </div>
    );
  }

  if (status === "checking") {
    return (
      <div
        className={`${base} border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] text-[var(--modulr-text)]`}
        role="status"
        aria-live="polite"
      >
        <span className="inline-flex items-center gap-2 font-medium">
          <span
            className="inline-block size-2 animate-pulse rounded-full bg-[var(--modulr-accent)]"
            aria-hidden
          />
          Checking availability…
        </span>
      </div>
    );
  }

  if (status === "available") {
    return (
      <div
        className={`${base} border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100/95`}
        role="status"
        aria-live="polite"
      >
        <span className="font-medium">Available</span> — this key looks free in the mock registry.
        You can continue.
      </div>
    );
  }

  return (
    <div
      className={`${base} border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100/90`}
      role="status"
      aria-live="polite"
    >
      <span className="font-medium">Already registered</span> — try another key (deterministic mock;
      some names always show as taken).
    </div>
  );
}

function PriceBlock({
  quote,
  previewVariant,
}: {
  quote: RegistrationPriceQuote;
  previewVariant: "name" | "org";
}) {
  if (!quote.normalized && !quote.hint) {
    return (
      <p className="modulr-text-muted mt-4 text-sm tabular-nums">Enter a value to see a mock quote.</p>
    );
  }
  if (!quote.valid) {
    return (
      <div className="mt-4 space-y-2">
        {quote.normalized ? (
          <p className="text-sm text-[var(--modulr-text)]">
            Preview:{" "}
            {previewVariant === "name" ? (
              <span className={previewNameClass()}>{quote.normalized}</span>
            ) : (
              <span className="font-mono font-medium text-[var(--modulr-accent)]">{quote.normalized}</span>
            )}
          </p>
        ) : null}
        {quote.hint ? (
          <p className="text-sm text-amber-600/90 dark:text-amber-400/90">{quote.hint}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-[var(--modulr-text)]">
        Registers as{" "}
        {previewVariant === "name" ? (
          <span className={previewNameClass()}>{quote.normalized}</span>
        ) : (
          <span className="font-mono font-semibold text-[var(--modulr-accent)]">{quote.normalized}</span>
        )}
      </p>
      {quote.graphemeCount != null ? (
        <p className="text-xs text-[var(--modulr-text-muted)]">
          Quote uses <span className="font-medium text-[var(--modulr-text)]">{quote.graphemeCount}</span>{" "}
          grapheme{quote.graphemeCount === 1 ? "" : "s"} — single-character names include a large
          premium line item.
        </p>
      ) : null}
      <ul className="max-w-md space-y-1.5 text-sm text-[var(--modulr-text-muted)]">
        {quote.lines.map((line) => (
          <li key={line.label} className="flex justify-between gap-4">
            <span>{line.label}</span>
            <span className="shrink-0 tabular-nums text-[var(--modulr-text)]">
              {formatMockUsd(line.amount)}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-[var(--modulr-glass-border)] pt-3 text-base font-semibold tabular-nums text-[var(--modulr-text)]">
        Estimated total{" "}
        <span className="text-[var(--modulr-accent)]">{formatMockUsd(quote.total)}</span>
        <span className="ml-2 text-xs font-normal text-[var(--modulr-text-muted)]">(mock)</span>
      </p>
      {quote.hint ? <p className="text-xs leading-relaxed text-[var(--modulr-text-muted)]">{quote.hint}</p> : null}
    </div>
  );
}

function RegisterFormSection({
  idPrefix,
  title,
  description,
  label,
  placeholder,
  value,
  onChange,
  quote,
  previewVariant,
  availability,
  onMockSubmit,
  submitNote,
}: {
  idPrefix: string;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  quote: RegistrationPriceQuote;
  previewVariant: "name" | "org";
  availability: MockAvailStatus;
  onMockSubmit: () => void;
  submitNote: string | null;
}) {
  const inputId = `${idPrefix}-input`;
  const canSubmit = quote.valid && availability === "available";

  let actionHint: string | null = null;
  if (quote.valid) {
    if (availability === "pending") {
      actionHint = "Pause typing — availability checks after ~1s idle.";
    } else if (availability === "checking") {
      actionHint = "Checking availability…";
    } else if (availability === "taken") {
      actionHint = "Choose a different key to continue.";
    } else if (availability === "idle_invalid") {
      actionHint = null;
    }
  } else {
    actionHint = "Enter a valid key to see pricing and availability.";
  }

  return (
    <GlassPanel className="p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]">{title}</h2>
          <p className="modulr-text-muted mt-2 max-w-2xl text-sm leading-relaxed">{description}</p>
        </div>
        <span className="rounded-full border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-1 text-xs font-medium text-[var(--modulr-text-muted)]">
          Mock quote
        </span>
      </div>

      <label className="mt-6 block text-xs font-medium text-[var(--modulr-text-muted)]" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
        autoComplete="off"
        spellCheck={false}
      />

      <PriceBlock quote={quote} previewVariant={previewVariant} />

      <AvailabilityStrip status={availability} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onMockSubmit}
          className="rounded-lg bg-[var(--modulr-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--modulr-accent-contrast)] shadow-md transition-opacity hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canSubmit}
        >
          Continue to register (mock)
        </button>
        {actionHint ? (
          <span className="text-xs text-[var(--modulr-text-muted)]">{actionHint}</span>
        ) : null}
      </div>

      {submitNote ? (
        <p
          className="mt-4 rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2 text-sm text-[var(--modulr-text)]"
          role="status"
        >
          {submitNote}
        </p>
      ) : null}
    </GlassPanel>
  );
}

export function RegistrationMock() {
  const regLearnId = useId();
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [orgInput, setOrgInput] = useState("");
  const [nameSubmitNote, setNameSubmitNote] = useState<string | null>(null);
  const [orgSubmitNote, setOrgSubmitNote] = useState<string | null>(null);
  const [orgMarketDepth, setOrgMarketDepth] = useState(0);

  const nameQuote = useMemo(() => mockNamePriceQuote(nameInput), [nameInput]);
  const orgQuote = useMemo(
    () => mockOrgPriceQuote(orgInput, orgMarketDepth),
    [orgInput, orgMarketDepth],
  );

  const nameAvail = useMockAvailability(nameQuote.normalized, nameQuote.valid, "name", 1000);
  const orgAvail = useMockAvailability(orgQuote.normalized, orgQuote.valid, "org", 1000);

  return (
    <div className="flex flex-col gap-8">
      <GlassPanel className="p-6 sm:p-8">
        <p className="font-modulr-display text-sm font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
          Core
        </p>
        <h1 className="font-modulr-display modulr-text mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Registration
        </h1>
        <p className="modulr-text-muted mt-4 max-w-3xl leading-relaxed">
          Two parallel flows: <span className="font-medium text-[var(--modulr-text)]">names</span>{" "}
          (handles — emoji count as one grapheme when supported) use scarcity tiers: one grapheme
          costs the most, 2–3 are about half, 4–5 about half again, six and up are standard pricing.
          <span className="font-medium text-[var(--modulr-text)]"> Organizations</span> use DNS-style
          keys; a single label is a whole delegated namespace (wildcard-style sub-space in this
          story). We don&apos;t sell segments named com, net, org, gov, or edu so traditional TLDs
          stay respected.
        </p>
        {!learnMoreOpen ? (
          <button
            type="button"
            className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--modulr-accent)] transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)]"
            aria-expanded={false}
            aria-controls={regLearnId}
            onClick={() => setLearnMoreOpen(true)}
          >
            <span className="select-none text-[10px]" aria-hidden>
              ▶
            </span>
            Learn more
          </button>
        ) : null}
        <div
          id={regLearnId}
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${learnMoreOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={`space-y-3 text-sm ${learnMoreOpen ? "border-t border-[var(--modulr-glass-border)] pt-4" : ""}`}
              aria-hidden={!learnMoreOpen}
            >
              <p className="modulr-text-muted max-w-3xl leading-relaxed">
                Org pricing mock: floor starts at{" "}
                <span className="font-medium text-[var(--modulr-text)]">$100</span> for the next
                whole-domain registration; each time you complete a mock org signup here, the floor
                doubles for the next buyer ($200, $400, …). Quotes and availability still update live
                as you type.
              </p>
              <p className="modulr-text-muted max-w-3xl leading-relaxed">
                <span className="font-medium text-[var(--modulr-text)]">Emoji note:</span> symbols
                are Unicode scalar values; UTF-8 is just the encoding on the wire. Browsers count
                &ldquo;characters&rdquo; with grapheme clusters when supported so many emoji read as
                one slot for pricing. Production still needs canonicalization rules so different
                spellings can&apos;t squat the same identity.
              </p>
              <p className="modulr-text-muted max-w-3xl leading-relaxed">
                When Modulr wallet login ships, a sensible rule is{" "}
                <span className="font-medium text-[var(--modulr-text)]">
                  one purchased name per identity
                </span>
                — no second personal handle unless policy changes. Org registration stays separate
                and may add verification steps in production.
              </p>
              {learnMoreOpen ? (
                <button
                  type="button"
                  className="flex items-center gap-2 pt-1 text-sm font-semibold text-[var(--modulr-accent)] transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)]"
                  aria-expanded
                  aria-controls={regLearnId}
                  onClick={() => setLearnMoreOpen(false)}
                >
                  <span className="select-none text-[10px]" aria-hidden>
                    ▲
                  </span>
                  Learn less
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </GlassPanel>

      <RegisterFormSection
        idPrefix="name-reg"
        title="Name registration"
        description="Reserve a public handle. Pricing is tiered by grapheme count (1 → 2–3 → 4–5 → 6+). Emoji and international text are OK; org keys below stay DNS-style ASCII."
        label="Desired name"
        placeholder="e.g. river-moss, 北, or 🌊"
        value={nameInput}
        onChange={(v) => {
          setNameInput(v);
          setNameSubmitNote(null);
        }}
        quote={nameQuote}
        previewVariant="name"
        availability={nameAvail}
        onMockSubmit={() =>
          setNameSubmitNote(
            `Mock only: you would sign with your wallet and send a register-name intent for “${nameQuote.normalized}”.`,
          )
        }
        submitNote={nameSubmitNote}
      />

      <RegisterFormSection
        idPrefix="org-reg"
        title="Organization registration"
        description="Single label = whole namespace (think unlimited *.yourkey). Deeper paths (bird.house) imply a wildcard under that path at a lower multiplier. Completing a mock registration below doubles the $100 floor for the next person in this demo."
        label="Organization key"
        placeholder="e.g. acme or labs.acme"
        value={orgInput}
        onChange={(v) => {
          setOrgInput(v);
          setOrgSubmitNote(null);
        }}
        quote={orgQuote}
        previewVariant="org"
        availability={orgAvail}
        onMockSubmit={() => {
          setOrgSubmitNote(
            `Mock only: you would confirm org registration for “${orgQuote.normalized}”. Next whole-domain anchor in this UI is now ${formatMockUsd(orgNamespaceAnchorUsd(orgMarketDepth + 1))}.`,
          );
          setOrgMarketDepth((d) => Math.min(d + 1, 20));
        }}
        submitNote={orgSubmitNote}
      />
    </div>
  );
}

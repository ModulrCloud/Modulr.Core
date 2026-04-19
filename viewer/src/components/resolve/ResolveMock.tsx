"use client";

import { useId, useMemo, useState, type ReactNode } from "react";

import { GlassPanel } from "@/components/shell/GlassPanel";

import { useDebounced } from "@/components/registration/useDebounced";

import { mockResolve, MODULR_WELL_KNOWN_KEY_MOCK } from "./mockResolve";

const inputClass =
  "mt-2 w-full max-w-2xl rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2.5 font-mono text-sm text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2";

function ResultCard({
  children,
  title,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-6 rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/30 px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--modulr-text-muted)]">
        {title}
      </p>
      <div className="mt-3 space-y-2 text-sm text-[var(--modulr-text)]">{children}</div>
    </div>
  );
}

export function ResolveMock() {
  const panelId = useId();
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const debounced = useDebounced(trimmed, 450);
  const pending = trimmed.length > 0 && trimmed !== debounced;

  const result = useMemo(() => mockResolve(debounced), [debounced]);

  return (
    <div className="flex flex-col gap-8">
      <GlassPanel className="p-6 sm:p-8">
        <p className="font-modulr-display text-sm font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
          Core
        </p>
        <h1 className="font-modulr-display modulr-text mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Resolve
        </h1>
        <p className="modulr-text-muted mt-4 max-w-2xl leading-relaxed">
          Turn a <span className="font-medium text-[var(--modulr-text)]">@username</span>, an{" "}
          <span className="font-medium text-[var(--modulr-text)]">organization key</span> (always
          includes a dot), or a{" "}
          <span className="font-medium text-[var(--modulr-text)]">public address</span> into the other
          side — mock data only, deterministic from what you type.
        </p>
        <p className="modulr-text-muted mt-3 max-w-2xl text-sm leading-relaxed">
          Names and orgs are unique in their own namespaces.           <span className="font-mono text-[var(--modulr-text)]">modulr</span> or{" "}
          <span className="font-mono text-[var(--modulr-text)]">modulr.anything</span> resolves to the
          same well-known system key in this demo:{" "}
          <span className="break-all font-mono text-xs text-[var(--modulr-text)]">
            {MODULR_WELL_KNOWN_KEY_MOCK}
          </span>
        </p>
      </GlassPanel>

      <GlassPanel className="p-6 sm:p-8" aria-labelledby={`${panelId}-resolve-label`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2
              id={`${panelId}-resolve-label`}
              className="font-modulr-display text-lg font-bold text-[var(--modulr-text)]"
            >
              Query
            </h2>
            <p className="modulr-text-muted mt-1 max-w-xl text-sm leading-relaxed">
              Pause briefly after typing; the mock resolver runs automatically. Omit @ and we still
              treat a bare token as a username.
            </p>
          </div>
          <span className="rounded-full border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-1 text-xs font-medium text-[var(--modulr-text-muted)]">
            Mock resolve
          </span>
        </div>

        <label className="mt-6 block text-xs font-medium text-[var(--modulr-text-muted)]" htmlFor={`${panelId}-q`}>
          Name, org, or address
        </label>
        <input
          id={`${panelId}-q`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="@you · labs.acme · 0x…"
          className={inputClass}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${panelId}-hint`}
        />
        <p id={`${panelId}-hint`} className="modulr-text-muted mt-2 text-xs">
          Try <span className="font-mono text-[var(--modulr-text)]">modulr</span> or{" "}
          <span className="font-mono text-[var(--modulr-text)]">modulr.public</span> for the shortcut
          key, or paste a 0x address to reverse-resolve.
        </p>

        {pending ? (
          <p className="mt-6 text-sm text-[var(--modulr-text-muted)]" role="status">
            <span className="inline-block size-2 animate-pulse rounded-full bg-[var(--modulr-accent)] align-middle" />{" "}
            Resolving…
          </p>
        ) : null}

        {!pending && result.kind === "empty" && trimmed.length === 0 ? (
          <p className="modulr-text-muted mt-6 text-sm">Enter something to see a mock binding.</p>
        ) : null}

        {!pending && result.kind === "empty" && trimmed.length > 0 ? (
          <p className="mt-6 text-sm text-amber-700 dark:text-amber-300">
            Add a handle, org key, or full 0x address.
          </p>
        ) : null}

        {!pending && result.kind === "forward_name" ? (
          <ResultCard title="Forward (name → address)">
            <p>
              <span className="text-[var(--modulr-text-muted)]">Name</span>{" "}
              <span className="font-semibold">{result.label}</span>
              {result.inferredAt ? (
                <span className="modulr-text-muted"> (added @ for you)</span>
              ) : null}
            </p>
            <p className="break-all font-mono text-xs sm:text-sm">{result.address}</p>
          </ResultCard>
        ) : null}

        {!pending && result.kind === "forward_org" ? (
          <ResultCard title="Forward (organization → address)">
            <p>
              <span className="text-[var(--modulr-text-muted)]">Organization</span>{" "}
              <span className="font-semibold">{result.label}</span>
            </p>
            <p className="break-all font-mono text-xs sm:text-sm">{result.address}</p>
          </ResultCard>
        ) : null}

        {!pending && result.kind === "forward_modulr" ? (
          <ResultCard title="Modulr namespace (shortcut)">
            <p>
              <span className="text-[var(--modulr-text-muted)]">Label</span>{" "}
              <span className="font-semibold">{result.label}</span>
            </p>
            <p className="break-all font-mono text-xs sm:text-sm">{result.address}</p>
            <p className="text-xs leading-relaxed text-[var(--modulr-text-muted)]">{result.note}</p>
          </ResultCard>
        ) : null}

        {!pending && result.kind === "reverse" ? (
          <ResultCard title="Reverse (address → identities)">
            <p>
              <span className="text-[var(--modulr-text-muted)]">Address</span>
            </p>
            <p className="break-all font-mono text-xs sm:text-sm">{result.address}</p>
            <p>
              <span className="text-[var(--modulr-text-muted)]">Mock name</span>{" "}
              <span className="font-semibold">{result.name}</span>
            </p>
            {result.org ? (
              <p>
                <span className="text-[var(--modulr-text-muted)]">Mock org</span>{" "}
                <span className="font-semibold">{result.org}</span>
              </p>
            ) : (
              <p className="text-xs text-[var(--modulr-text-muted)]">No mock org bound on this key.</p>
            )}
          </ResultCard>
        ) : null}
      </GlassPanel>
    </div>
  );
}

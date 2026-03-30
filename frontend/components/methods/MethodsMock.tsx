"use client";

import { useCallback, useMemo, useState } from "react";

import { GlassPanel } from "@/components/shell/GlassPanel";

import {
  buildMockMethodResponse,
  METHOD_CATALOG,
  type MethodDef,
} from "./mockMethodCatalog";
import { PrettyMockResponse } from "./PrettyMockResponse";

const fieldClass =
  "mt-1 w-full rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2 text-sm text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function MethodsMock() {
  const [selectedId, setSelectedId] = useState(METHOD_CATALOG[0]!.id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const selected = useMemo(
    () => METHOD_CATALOG.find((m) => m.id === selectedId) ?? METHOD_CATALOG[0]!,
    [selectedId],
  );

  const setParam = useCallback((name: string, v: string) => {
    setValues((prev) => ({ ...prev, [name]: v }));
  }, []);

  const onSelectMethod = useCallback((id: string) => {
    setSelectedId(id);
    setError(null);
    setResult(null);
    const def = METHOD_CATALOG.find((m) => m.id === id);
    const next: Record<string, string> = {};
    def?.params.forEach((p) => {
      if (p.options?.length) next[p.name] = p.options[0]!.value;
    });
    setValues(next);
  }, []);

  const runMock = useCallback(async () => {
    setError(null);
    setResult(null);
    const missing = selected.params.filter((p) => p.required !== false && !values[p.name]?.trim());
    if (missing.length > 0) {
      setError(`Fill in: ${missing.map((m) => m.label).join(", ")}`);
      return;
    }
    setLoading(true);
    await delay(420 + (selected.title.length * 7) % 200);
    const payload: Record<string, string> = {};
    for (const p of selected.params) {
      payload[p.name] = values[p.name]?.trim() ?? "";
    }
    setResult(buildMockMethodResponse(selected.id, payload));
    setLoading(false);
  }, [selected, values]);

  return (
    <div className="flex flex-col gap-8">
      <GlassPanel className="p-6 sm:p-8">
        <p className="font-modulr-display text-sm font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
          Core
        </p>
        <h1 className="font-modulr-display modulr-text mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Methods
        </h1>
        <p className="modulr-text-muted mt-4 max-w-3xl leading-relaxed">
          Operations exposed by <span className="font-medium text-[var(--modulr-text)]">Modulr.Core</span>{" "}
          — routing (protocol-agnostic <span className="font-medium text-[var(--modulr-text)]">route type</span>{" "}
          + <span className="font-medium text-[var(--modulr-text)]">route</span>), module state
          reports, discovery manifests (<span className="font-medium text-[var(--modulr-text)]">code storage</span>
          ), names, orgs, and heartbeats. Contract-style fields, one mock execute, readable results
          (no signed envelope from this UI).
        </p>
        <p className="modulr-text-muted mt-3 max-w-2xl text-sm leading-relaxed">
          Real traffic stays in the versioned, signed message format; this page is a friendly surface
          for exploring what each call expects.
        </p>
      </GlassPanel>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <GlassPanel className="p-4 sm:p-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:w-72 lg:shrink-0 lg:overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
            Operations
          </p>
          <nav className="mt-3 flex flex-col gap-1" aria-label="Core methods">
            {METHOD_CATALOG.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMethod(m.id)}
                className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  m.id === selectedId
                    ? "bg-[var(--modulr-accent)]/15 text-[var(--modulr-accent)] ring-1 ring-[var(--modulr-accent)]/35"
                    : "text-[var(--modulr-text)] hover:bg-[var(--modulr-glass-fill)]"
                }`}
              >
                <span className="font-mono text-xs">{m.title}</span>
              </button>
            ))}
          </nav>
        </GlassPanel>

        <div className="min-w-0 flex-1 space-y-6">
          <MethodPanel
            method={selected}
            values={values}
            onChange={setParam}
            onExecute={runMock}
            loading={loading}
            error={error}
            result={result}
          />
        </div>
      </div>
    </div>
  );
}

function MethodPanel({
  method,
  values,
  onChange,
  onExecute,
  loading,
  error,
  result,
}: {
  method: MethodDef;
  values: Record<string, string>;
  onChange: (name: string, v: string) => void;
  onExecute: () => void;
  loading: boolean;
  error: string | null;
  result: Record<string, unknown> | null;
}) {
  return (
    <GlassPanel className="p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-modulr-display text-xl font-bold tracking-tight text-[var(--modulr-text)]">
            <span className="font-mono text-lg">{method.title}</span>
          </h2>
          <p className="modulr-text-muted mt-2 max-w-2xl text-sm leading-relaxed">{method.summary}</p>
        </div>
        <span className="rounded-full border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-1 text-xs font-medium text-[var(--modulr-text-muted)]">
          Mock execution
        </span>
      </div>

      <div className="mt-6 rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
          Parameters
        </p>
        {method.params.length === 0 ? (
          <p className="modulr-text-muted mt-3 text-sm">No parameters — call is nullary in this mock.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {method.params.map((p) => (
              <div key={p.name}>
                <label className="text-xs font-medium text-[var(--modulr-text-muted)]" htmlFor={`m-${method.id}-${p.name}`}>
                  {p.label}
                  {p.required === false ? (
                    <span className="font-normal text-[var(--modulr-text-muted)]"> (optional)</span>
                  ) : null}
                </label>
                {p.options?.length ? (
                  <select
                    id={`m-${method.id}-${p.name}`}
                    value={values[p.name] ?? p.options[0]!.value}
                    onChange={(e) => onChange(p.name, e.target.value)}
                    className={fieldClass}
                  >
                    {p.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : p.multiline ? (
                  <textarea
                    id={`m-${method.id}-${p.name}`}
                    value={values[p.name] ?? ""}
                    onChange={(e) => onChange(p.name, e.target.value)}
                    placeholder={p.placeholder}
                    rows={4}
                    className={`${fieldClass} resize-y font-mono text-xs leading-relaxed`}
                    autoComplete="off"
                    spellCheck={false}
                  />
                ) : (
                  <input
                    id={`m-${method.id}-${p.name}`}
                    type="text"
                    value={values[p.name] ?? ""}
                    onChange={(e) => onChange(p.name, e.target.value)}
                    placeholder={p.placeholder}
                    className={fieldClass}
                    autoComplete="off"
                    spellCheck={false}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onExecute}
            disabled={loading}
            className="rounded-lg bg-[var(--modulr-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--modulr-accent-contrast)] shadow-md transition-opacity hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? "Executing…" : "Execute (mock)"}
          </button>
          <span className="text-xs text-[var(--modulr-text-muted)]">
            Simulates round-trip delay; response is deterministic from your inputs.
          </span>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100/90" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-6 rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)]/40 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
            Response
          </p>
          <div className="mt-4">
            <PrettyMockResponse data={result} />
          </div>
        </div>
      ) : null}
    </GlassPanel>
  );
}

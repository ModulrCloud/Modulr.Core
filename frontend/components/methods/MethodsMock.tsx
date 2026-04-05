"use client";

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";

import { useAppUi } from "@/components/providers/AppProviders";
import { GlassPanel } from "@/components/shell/GlassPanel";
import { ModulrSelect } from "@/components/ui/ModulrSelect";
import { executeGetProtocolVersion, executeSignedCoreOperation } from "@/lib/coreApi";
import { primaryCoreBaseUrl } from "@/lib/coreBaseUrl";
import { formatClientError } from "@/lib/formatClientError";

import {
  buildMockMethodResponse,
  METHOD_CATALOG,
  METHOD_CATEGORY_TABS,
  type MethodCategory,
  type MethodDef,
} from "./mockMethodCatalog";
import { PrettyMockResponse } from "./PrettyMockResponse";

const fieldClass =
  "mt-1 w-full rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2 text-sm text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Max methods shown in the sidebar list before paginating (keeps the nav scannable). */
const METHODS_PAGE_SIZE = 14;

const LIVE_SIGNED_METHOD_IDS = new Set<string>([
  "get_protocol_version",
  "get_protocol_methods",
  "lookup_module",
  "get_module_methods",
  "get_module_route",
  "get_module_state",
  "submit_module_route",
  "remove_module_route",
  "report_module_state",
]);

function liveExecuteHint(methodId: string): string {
  if (methodId === "get_protocol_version") {
    return "Uses GET /version for the wire protocol_version, then a fresh Ed25519 key (dev-friendly).";
  }
  if (methodId === "lookup_module") {
    return "Same signing path. The module must already be registered or Core returns MODULE_NOT_FOUND.";
  }
  if (methodId === "get_module_methods") {
    return "Same signing path. For modulr.core returns Core wire methods; other modules return an empty list until manifests exist.";
  }
  if (methodId === "get_protocol_methods") {
    return "Same signing path. Empty payload. Returns protocol-level methods (version surface, this method, heartbeat).";
  }
  if (methodId === "get_module_route") {
    return "Same signing path. Returns route_detail (full JSON) and, when the doc has route_type + route strings, those flattened for convenience.";
  }
  if (methodId === "submit_module_route") {
    return "Same signing path. This form defaults mode to merge (stack dials). If you omit mode on the wire entirely, Core uses replace_all. modulr.core merge (and remove) need a bootstrap key when dev_mode is off and bootstrap keys are set. Optional priority and endpoint_signing_public_key_hex.";
  }
  if (methodId === "remove_module_route") {
    return "Same signing path. Removes one dial matching module_id + route_type + route. modulr.core: bootstrap when locked; registered modules: module signing key.";
  }
  if (methodId === "report_module_state") {
    return "Same signing path. module_id + state_phase (running, syncing, degraded, maintenance) and optional detail. Sender must be the module’s registered signing key.";
  }
  if (methodId === "get_module_state") {
    return "Same signing path. Read-only: latest stored snapshot for module_id (nulls if never reported). modulr.core is allowed even without a modules row.";
  }
  return "Uses GET /version for the wire protocol_version, then a fresh Ed25519 key (dev-friendly).";
}

export function MethodsMock() {
  const { settings } = useAppUi();
  const [categoryTab, setCategoryTab] = useState<MethodCategory>("protocol");
  const [selectedId, setSelectedId] = useState(METHOD_CATALOG[0]!.id);
  const [methodSearch, setMethodSearch] = useState("");
  const [methodPage, setMethodPage] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const methodsInCategory = useMemo(
    () => METHOD_CATALOG.filter((m) => m.category === categoryTab),
    [categoryTab],
  );

  const filteredMethods = useMemo(() => {
    const q = methodSearch.trim().toLowerCase();
    if (!q) return methodsInCategory;
    return methodsInCategory.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        m.summary.toLowerCase().includes(q),
    );
  }, [methodsInCategory, methodSearch]);

  const methodPageCount =
    filteredMethods.length === 0 ? 0 : Math.ceil(filteredMethods.length / METHODS_PAGE_SIZE);
  const methodPageMax = Math.max(0, methodPageCount - 1);
  const safeMethodPage = Math.min(methodPage, methodPageMax);
  const pagedMethods = useMemo(
    () =>
      filteredMethods.slice(
        safeMethodPage * METHODS_PAGE_SIZE,
        safeMethodPage * METHODS_PAGE_SIZE + METHODS_PAGE_SIZE,
      ),
    [filteredMethods, safeMethodPage],
  );

  useEffect(() => {
    setMethodPage(0);
  }, [categoryTab, methodSearch]);

  useEffect(() => {
    setMethodPage((p) => Math.min(p, methodPageMax));
  }, [methodPageMax]);

  const selected = useMemo((): MethodDef | null => {
    const cur = METHOD_CATALOG.find((m) => m.id === selectedId);
    const inFiltered = cur && filteredMethods.some((m) => m.id === cur.id);
    if (inFiltered) return cur;
    return filteredMethods[0] ?? null;
  }, [selectedId, filteredMethods]);

  useEffect(() => {
    if (!selected) return;
    const next: Record<string, string> = {};
    selected.params.forEach((p) => {
      if (p.options?.length) next[p.name] = p.options[0]!.value;
    });
    setValues(next);
  }, [selected]);

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

  const runExecute = useCallback(async () => {
    setError(null);
    setResult(null);
    if (!selected) return;
    const missing = selected.params.filter((p) => p.required !== false && !values[p.name]?.trim());
    if (missing.length > 0) {
      setError(`Fill in: ${missing.map((m) => m.label).join(", ")}`);
      return;
    }

    if (selected.id === "get_protocol_version") {
      const base = primaryCoreBaseUrl(settings.coreEndpoints);
      if (!base) {
        setError("Set a Core base URL in settings.");
        return;
      }
      setLoading(true);
      try {
        const data = await executeGetProtocolVersion(base);
        setResult(data);
      } catch (e: unknown) {
        setError(formatClientError(e));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (selected.id === "lookup_module") {
      const base = primaryCoreBaseUrl(settings.coreEndpoints);
      if (!base) {
        setError("Set a Core base URL in settings.");
        return;
      }
      const moduleName = values.module_name?.trim() ?? "";
      setLoading(true);
      try {
        const data = await executeSignedCoreOperation(base, "lookup_module", {
          module_name: moduleName,
        });
        setResult(data);
      } catch (e: unknown) {
        setError(formatClientError(e));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (selected.id === "get_module_methods") {
      const base = primaryCoreBaseUrl(settings.coreEndpoints);
      if (!base) {
        setError("Set a Core base URL in settings.");
        return;
      }
      const moduleId = values.module_id?.trim() ?? "";
      setLoading(true);
      try {
        const data = await executeSignedCoreOperation(base, "get_module_methods", {
          module_id: moduleId,
        });
        setResult(data);
      } catch (e: unknown) {
        setError(formatClientError(e));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (selected.id === "get_protocol_methods") {
      const base = primaryCoreBaseUrl(settings.coreEndpoints);
      if (!base) {
        setError("Set a Core base URL in settings.");
        return;
      }
      setLoading(true);
      try {
        const data = await executeSignedCoreOperation(base, "get_protocol_methods", {});
        setResult(data);
      } catch (e: unknown) {
        setError(formatClientError(e));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (selected.id === "get_module_route") {
      const base = primaryCoreBaseUrl(settings.coreEndpoints);
      if (!base) {
        setError("Set a Core base URL in settings.");
        return;
      }
      const moduleId = values.module_id?.trim() ?? "";
      setLoading(true);
      try {
        const data = await executeSignedCoreOperation(base, "get_module_route", {
          module_id: moduleId,
        });
        setResult(data);
      } catch (e: unknown) {
        setError(formatClientError(e));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (selected.id === "get_module_state") {
      const base = primaryCoreBaseUrl(settings.coreEndpoints);
      if (!base) {
        setError("Set a Core base URL in settings.");
        return;
      }
      const moduleId = values.module_id?.trim() ?? "";
      setLoading(true);
      try {
        const data = await executeSignedCoreOperation(base, "get_module_state", {
          module_id: moduleId,
        });
        setResult(data);
      } catch (e: unknown) {
        setError(formatClientError(e));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (selected.id === "report_module_state") {
      const base = primaryCoreBaseUrl(settings.coreEndpoints);
      if (!base) {
        setError("Set a Core base URL in settings.");
        return;
      }
      const moduleId = values.module_id?.trim() ?? "";
      const statePhase = values.state_phase?.trim() ?? "";
      const detail = values.detail?.trim();
      setLoading(true);
      try {
        const payload: Record<string, unknown> = {
          module_id: moduleId,
          state_phase: statePhase,
        };
        if (detail) payload.detail = detail;
        const data = await executeSignedCoreOperation(base, "report_module_state", payload);
        setResult(data);
      } catch (e: unknown) {
        setError(formatClientError(e));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (selected.id === "submit_module_route") {
      const base = primaryCoreBaseUrl(settings.coreEndpoints);
      if (!base) {
        setError("Set a Core base URL in settings.");
        return;
      }
      const moduleId = values.module_id?.trim() ?? "";
      const routeType = values.route_type?.trim() ?? "";
      const route = values.route?.trim() ?? "";
      const mode = values.mode?.trim();
      const priorityRaw = values.priority?.trim();
      const endpointHex = values.endpoint_signing_public_key_hex?.trim();
      setLoading(true);
      try {
        const payload: Record<string, unknown> = {
          module_id: moduleId,
          route_type: routeType,
          route,
        };
        if (mode) payload.mode = mode;
        if (priorityRaw) {
          const n = Number.parseInt(priorityRaw, 10);
          if (!Number.isNaN(n)) payload.priority = n;
        }
        if (endpointHex) payload.endpoint_signing_public_key_hex = endpointHex;
        const data = await executeSignedCoreOperation(
          base,
          "submit_module_route",
          payload,
        );
        setResult(data);
      } catch (e: unknown) {
        setError(formatClientError(e));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (selected.id === "remove_module_route") {
      const base = primaryCoreBaseUrl(settings.coreEndpoints);
      if (!base) {
        setError("Set a Core base URL in settings.");
        return;
      }
      const moduleId = values.module_id?.trim() ?? "";
      const routeType = values.route_type?.trim() ?? "";
      const route = values.route?.trim() ?? "";
      setLoading(true);
      try {
        const data = await executeSignedCoreOperation(base, "remove_module_route", {
          module_id: moduleId,
          route_type: routeType,
          route,
        });
        setResult(data);
      } catch (e: unknown) {
        setError(formatClientError(e));
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      await delay(420 + (selected.title.length * 7) % 200);
      const payload: Record<string, string> = {};
      for (const p of selected.params) {
        payload[p.name] = values[p.name]?.trim() ?? "";
      }
      setResult(buildMockMethodResponse(selected.id, payload));
    } catch (e: unknown) {
      setError(formatClientError(e));
    } finally {
      setLoading(false);
    }
  }, [selected, values, settings.coreEndpoints]);

  const safeExecute = useCallback(() => {
    void runExecute().catch((e: unknown) => {
      setError(formatClientError(e));
      setLoading(false);
    });
  }, [runExecute]);

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
          Methods grouped by <span className="font-medium text-[var(--modulr-text)]">protocol</span> (version + heartbeat),{" "}
          <span className="font-medium text-[var(--modulr-text)]">validator</span> (coordination / Core),{" "}
          <span className="font-medium text-[var(--modulr-text)]">provider</span>, and{" "}
          <span className="font-medium text-[var(--modulr-text)]">client</span> slices — preview of how discovery
          JSON will be partitioned (tabs are static for now; wire catalog comes next).
        </p>
        <p className="modulr-text-muted mt-3 max-w-2xl text-sm leading-relaxed">
          <span className="font-medium text-[var(--modulr-text)]">get_protocol_version</span>,{" "}
          <span className="font-medium text-[var(--modulr-text)]">get_protocol_methods</span>,{" "}
          <span className="font-medium text-[var(--modulr-text)]">lookup_module</span>,{" "}
          <span className="font-medium text-[var(--modulr-text)]">get_module_methods</span>,{" "}
          <span className="font-medium text-[var(--modulr-text)]">get_module_route</span>,{" "}
          <span className="font-medium text-[var(--modulr-text)]">get_module_state</span>,{" "}
          <span className="font-medium text-[var(--modulr-text)]">report_module_state</span>,{" "}
          <span className="font-medium text-[var(--modulr-text)]">submit_module_route</span>, and{" "}
          <span className="font-medium text-[var(--modulr-text)]">remove_module_route</span>{" "}
          call your configured
          Core (signed{" "}
          <code className="rounded bg-[var(--modulr-page-bg-2)] px-1">POST /message</code>
          ). Other methods still use mock responses until wired.
        </p>
      </GlassPanel>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <GlassPanel className="p-4 sm:p-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:w-96 lg:shrink-0 lg:overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
            Category
          </p>
          <div
            className="mt-2 flex flex-nowrap gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Method category"
          >
            {METHOD_CATEGORY_TABS.map((tab) => {
              const count = METHOD_CATALOG.filter((m) => m.category === tab.id).length;
              const isActive = categoryTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  title={tab.description}
                  onClick={() => {
                    setCategoryTab(tab.id);
                    setMethodSearch("");
                  }}
                  className={`shrink-0 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--modulr-accent)]/15 text-[var(--modulr-accent)] ring-1 ring-[var(--modulr-accent)]/35"
                      : "text-[var(--modulr-text-muted)] hover:bg-[var(--modulr-glass-fill)] hover:text-[var(--modulr-text)]"
                  }`}
                >
                  <span className="block leading-tight">{tab.label}</span>
                  <span className="block text-[10px] font-normal opacity-80">
                    {count} method{count === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="modulr-text-muted mt-3 text-[11px] leading-snug">{METHOD_CATEGORY_TABS.find((t) => t.id === categoryTab)?.description}</p>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]" htmlFor="methods-search">
            Search
          </label>
          <input
            id="methods-search"
            type="search"
            value={methodSearch}
            onChange={(e) => setMethodSearch(e.target.value)}
            placeholder="Filter by name or description…"
            autoComplete="off"
            spellCheck={false}
            className={`${fieldClass} mt-1.5`}
            aria-describedby="methods-search-hint"
          />
          <p id="methods-search-hint" className="modulr-text-muted mt-1.5 text-[11px] leading-snug">
            {methodSearch.trim()
              ? `${filteredMethods.length} of ${methodsInCategory.length} in this category`
              : `${methodsInCategory.length} in this category`}
          </p>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
            Methods
          </p>
          <nav className="mt-2 flex flex-col gap-1" aria-label="Methods in this category">
            {filteredMethods.length === 0 ? (
              <p className="modulr-text-muted rounded-lg border border-dashed border-[var(--modulr-glass-border)] px-3 py-4 text-xs leading-relaxed">
                {methodSearch.trim()
                  ? `No methods match “${methodSearch.trim()}” in this category.`
                  : "No methods in this slice yet — placeholders for upcoming provider/client flows."}
              </p>
            ) : (
              pagedMethods.map((m) => {
                const isSel = selected?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectMethod(m.id)}
                    aria-label={
                      m.coreSurface
                        ? `${m.title}, modulr.core coordination method`
                        : m.title
                    }
                    title={
                      m.coreSurface
                        ? "M — implemented on modulr.core in MVP (coordination plane), not reimplemented by arbitrary modules."
                        : undefined
                    }
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                      isSel
                        ? "bg-[var(--modulr-accent)]/15 text-[var(--modulr-accent)] ring-1 ring-[var(--modulr-accent)]/35"
                        : "text-[var(--modulr-text)] hover:bg-[var(--modulr-glass-fill)]"
                    }`}
                  >
                    <span className="min-w-0 truncate font-mono text-xs">{m.title}</span>
                    {m.coreSurface ? (
                      <span
                        className="shrink-0 text-xs font-semibold tabular-nums text-[var(--modulr-accent)]"
                        aria-hidden
                      >
                        M
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </nav>
          {filteredMethods.length > METHODS_PAGE_SIZE ? (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--modulr-glass-border)] pt-3">
              <button
                type="button"
                disabled={safeMethodPage <= 0}
                onClick={() => setMethodPage((p) => Math.max(0, p - 1))}
                className="rounded-md border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-2.5 py-1 text-[11px] font-medium text-[var(--modulr-text)] transition-colors enabled:hover:border-[var(--modulr-accent)]/40 enabled:hover:text-[var(--modulr-accent)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Previous
              </button>
              <span className="modulr-text-muted text-center text-[11px] tabular-nums">
                {safeMethodPage + 1} / {methodPageCount}
              </span>
              <button
                type="button"
                disabled={safeMethodPage >= methodPageMax}
                onClick={() => setMethodPage((p) => Math.min(methodPageMax, p + 1))}
                className="rounded-md border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-2.5 py-1 text-[11px] font-medium text-[var(--modulr-text)] transition-colors enabled:hover:border-[var(--modulr-accent)]/40 enabled:hover:text-[var(--modulr-accent)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Next
              </button>
            </div>
          ) : null}
        </GlassPanel>

        <div className="min-w-0 flex-1 space-y-6">
          {selected ? (
            <MethodPanel
              method={selected}
              values={values}
              onChange={setParam}
              onExecute={safeExecute}
              loading={loading}
              error={error}
              result={result}
              liveSigned={LIVE_SIGNED_METHOD_IDS.has(selected.id)}
              liveHint={liveExecuteHint(selected.id)}
            />
          ) : (
            <GlassPanel className="p-8">
              <p className="modulr-text-muted text-sm leading-relaxed">
                {methodSearch.trim() && methodsInCategory.length > 0
                  ? "No method matches your search in this category. Try another term or clear the filter."
                  : "Select a category that lists methods, or choose another tab."}
              </p>
            </GlassPanel>
          )}
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
  liveSigned,
  liveHint,
}: {
  method: MethodDef;
  values: Record<string, string>;
  onChange: (name: string, v: string) => void;
  onExecute: () => void;
  loading: boolean;
  error: string | null;
  result: Record<string, unknown> | null;
  liveSigned: boolean;
  liveHint: string;
}) {
  const lastFieldSubmit = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, multiline: boolean) => {
      if (e.nativeEvent.isComposing) return;
      if (multiline) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (!loading) onExecute();
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (!loading) onExecute();
      }
    },
    [loading, onExecute],
  );

  const lastParam = method.params[method.params.length - 1];
  const lastFieldEnterTip =
    method.params.length === 0
      ? null
      : lastParam?.options?.length
        ? "Last field: Enter runs Execute when the dropdown is closed."
        : lastParam?.multiline
          ? "Last field: Ctrl+Enter (⌘+Enter on Mac) runs Execute."
          : "Last field: Enter runs Execute.";

  return (
    <GlassPanel className="p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-modulr-display text-xl font-bold tracking-tight text-[var(--modulr-text)]">
            <span className="font-mono text-lg">{method.title}</span>
          </h2>
          <p className="modulr-text-muted mt-2 max-w-2xl text-sm leading-relaxed">{method.summary}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            liveSigned
              ? "border-[var(--modulr-accent)]/40 bg-[var(--modulr-accent)]/12 text-[var(--modulr-accent)]"
              : "border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] text-[var(--modulr-text-muted)]"
          }`}
        >
          {liveSigned ? "Live · signed POST" : "Mock execution"}
        </span>
      </div>

      <div className="mt-6 rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/20 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
          Parameters
        </p>
        {method.params.length === 0 ? (
          <p className="modulr-text-muted mt-3 text-sm">No parameters for this method.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {method.params.map((p, idx) => {
              const isLastField = idx === method.params.length - 1;
              return (
                <div key={p.name}>
                  <label className="text-xs font-medium text-[var(--modulr-text-muted)]" htmlFor={`m-${method.id}-${p.name}`}>
                    {p.label}
                    {p.required === false ? (
                      <span className="font-normal text-[var(--modulr-text-muted)]"> (optional)</span>
                    ) : null}
                  </label>
                  {p.options?.length ? (
                    <ModulrSelect
                      id={`m-${method.id}-${p.name}`}
                      value={values[p.name] ?? p.options[0]!.value}
                      onChange={(v) => onChange(p.name, v)}
                      options={p.options}
                      onEnterWhenClosed={
                        isLastField
                          ? () => {
                              if (!loading) onExecute();
                            }
                          : undefined
                      }
                    />
                  ) : p.multiline ? (
                    <textarea
                      id={`m-${method.id}-${p.name}`}
                      value={values[p.name] ?? ""}
                      onChange={(e) => onChange(p.name, e.target.value)}
                      onKeyDown={isLastField ? (e) => lastFieldSubmit(e, true) : undefined}
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
                      onKeyDown={isLastField ? (e) => lastFieldSubmit(e, false) : undefined}
                      placeholder={p.placeholder}
                      className={fieldClass}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onExecute}
            disabled={loading}
            className="rounded-lg bg-[var(--modulr-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--modulr-accent-contrast)] shadow-md transition-opacity hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? "Executing…" : liveSigned ? "Execute" : "Execute (mock)"}
          </button>
          <span className="text-xs text-[var(--modulr-text-muted)]">
            {liveSigned ? liveHint : "Simulates round-trip delay; response is deterministic from your inputs."}
          </span>
        </div>
        {lastFieldEnterTip ? (
          <p className="mt-2 text-xs text-[var(--modulr-text-muted)]">{lastFieldEnterTip}</p>
        ) : null}
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

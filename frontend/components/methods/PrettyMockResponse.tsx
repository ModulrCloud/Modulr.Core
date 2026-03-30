"use client";

function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export function PrettyMockResponse({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);

  return (
    <ul className="space-y-4">
      {entries.map(([key, value]) => (
        <li
          key={key}
          className="border-b border-[var(--modulr-glass-border)] pb-4 last:border-0 last:pb-0"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--modulr-text-muted)]">
            {key.replace(/_/g, " ")}
          </p>
          <div className="mt-2 min-w-0 text-sm text-[var(--modulr-text)]">
            {Array.isArray(value) ? (
              <ul className="space-y-1 border-l-2 border-[var(--modulr-accent)]/35 pl-3 font-mono text-xs">
                {value.map((item, i) => (
                  <li key={i} className="break-all">
                    {formatScalar(item)}
                  </li>
                ))}
              </ul>
            ) : typeof value === "object" && value !== null ? (
              <pre className="overflow-x-auto rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/40 p-3 font-mono text-xs leading-relaxed">
                {JSON.stringify(value, null, 2)}
              </pre>
            ) : (
              <span className="break-all font-mono text-xs">{formatScalar(value)}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

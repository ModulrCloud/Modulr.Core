"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";

import type {
  DashboardCardInput,
  DashboardPieInput,
  ReportModuleDashboardState,
} from "@/lib/reportModuleStateDetail";
import {
  FIXED_STANDARD_METRIC_CARD_COUNT,
  FIXED_STANDARD_METRIC_CARDS,
  HEALTH_AUX_LABEL_MAX_CHARS,
  HEALTH_AUX_SERIES_UI,
  HEALTH_JOBS_UI,
  MAX_CARD_DESCRIPTION_CHARS,
  MAX_CUSTOM_DASHBOARD_CARDS,
  MAX_DASHBOARD_PIES,
  MAX_PIE_DESCRIPTION_CHARS,
  MAX_PIE_SLICES,
  NOTES_UI,
  parseHealthAuxLabel,
  parseHealthSeries24Csv,
  VALIDATOR_STATUS_PIE_UI,
} from "@/lib/reportModuleStateDetail";

const inp =
  "mt-1 w-full rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2 text-sm text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2";
const ta = `${inp} modulr-scrollbar resize-y font-mono text-xs leading-relaxed`;
const roTitle =
  "select-none rounded-md border border-[var(--modulr-glass-border)]/70 bg-[var(--modulr-page-bg)]/35 px-3 py-2 text-sm font-medium text-[var(--modulr-text-muted)]";
const roBody =
  "select-none rounded-md border border-[var(--modulr-glass-border)]/70 bg-[var(--modulr-page-bg)]/25 px-3 py-2 text-sm leading-relaxed text-[var(--modulr-text-muted)]";

const emptyCard = (): DashboardCardInput => ({ title: "", value: "", description: "" });
const emptySlice = () => ({ label: "", percent: "" });
const emptyPie = (): DashboardPieInput => ({
  metric_name: "",
  total: "",
  description: "",
  slices: [emptySlice(), emptySlice(), emptySlice()],
});

const HEALTH_PREVIEW_COLORS = {
  jobs: "var(--modulr-accent)",
  aux1: "#38bdf8",
  aux2: "#8b5cf6",
} as const;

function parseHealthPreviewSeries(values: Record<string, string>):
  | { ok: true; series: { name: string; points: number[]; stroke: string }[] }
  | { ok: false } {
  const jobs = parseHealthSeries24Csv(values[HEALTH_JOBS_UI.pointsKey], "Jobs");
  if (!jobs.ok) return { ok: false };
  const a1l = parseHealthAuxLabel(values[HEALTH_AUX_SERIES_UI[0]!.labelKey], "Aux 1 label");
  if (!a1l.ok) return { ok: false };
  const a1p = parseHealthSeries24Csv(values[HEALTH_AUX_SERIES_UI[0]!.pointsKey], "Aux 1");
  if (!a1p.ok) return { ok: false };
  const a2l = parseHealthAuxLabel(values[HEALTH_AUX_SERIES_UI[1]!.labelKey], "Aux 2 label");
  if (!a2l.ok) return { ok: false };
  const a2p = parseHealthSeries24Csv(values[HEALTH_AUX_SERIES_UI[1]!.pointsKey], "Aux 2");
  if (!a2p.ok) return { ok: false };
  return {
    ok: true,
    series: [
      { name: "Jobs", points: jobs.points, stroke: HEALTH_PREVIEW_COLORS.jobs },
      { name: a1l.label, points: a1p.points, stroke: HEALTH_PREVIEW_COLORS.aux1 },
      { name: a2l.label, points: a2p.points, stroke: HEALTH_PREVIEW_COLORS.aux2 },
    ],
  };
}

function HealthActivitySparkPreview({
  series,
}: {
  series: { name: string; points: number[]; stroke: string }[];
}) {
  const w = 100;
  const h = 36;
  const max = Math.max(1e-9, ...series.flatMap((s) => s.points));
  const pathFor = (points: number[]) =>
    points
      .map((v, i) => {
        const x = (i / 23) * w;
        const y = h - (v / max) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  return (
    <div className="mt-4 rounded-md border border-[var(--modulr-glass-border)]/80 bg-[var(--modulr-page-bg)]/25 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
        Preview (normalized to shared scale)
      </p>
      <svg
        className="mt-2 block h-28 w-full"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {series.map((s) => (
          <path
            key={s.name}
            d={pathFor(s.points)}
            fill="none"
            stroke={s.stroke}
            strokeWidth={0.9}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--modulr-text-muted)]">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: s.stroke }} />
            <span className="truncate">{s.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Props = {
  values: Record<string, string>;
  onValueChange: (name: string, v: string) => void;
  dashboard: ReportModuleDashboardState;
  setDashboard: Dispatch<SetStateAction<ReportModuleDashboardState>>;
};

export function ReportModuleStateDashboardFields({
  values,
  onValueChange,
  dashboard,
  setDashboard,
}: Props) {
  const healthPreview = useMemo(() => parseHealthPreviewSeries(values), [values]);

  return (
    <div className="mt-6 space-y-8 border-t border-[var(--modulr-glass-border)] pt-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
          Standard metric cards (1–{FIXED_STANDARD_METRIC_CARD_COUNT})
        </p>
        <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
          Fixed titles and descriptions match the wire <code className="text-[var(--modulr-text)]">metrics</code> object.
          Only the value is editable.
        </p>
        <div className="mt-3 space-y-4">
          {FIXED_STANDARD_METRIC_CARDS.map((row, i) => (
            <div
              key={row.valueKey}
              className="rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 p-3 sm:p-4"
            >
              <span className="text-[11px] font-medium text-[var(--modulr-text-muted)]">
                Card {i + 1}
              </span>
              <p className={roTitle}>{row.title}</p>
              <p className={`${roBody} mt-2`}>{row.description}</p>
              <label className="mt-3 block text-xs font-medium text-[var(--modulr-text-muted)]">
                Value
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={values[row.valueKey] ?? ""}
                onChange={(e) =>
                  onValueChange(row.valueKey, e.target.value.replace(/\D/g, ""))
                }
                className={inp}
                placeholder="non-negative integer"
                autoComplete="off"
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
          Validator status (standard pie)
        </p>
        <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
          Same data as <code className="text-[var(--modulr-text)]">validator_status_pct</code> on the wire. Total stays in
          sync with Card 4 (Validators).
        </p>
        <div className="mt-3 rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 p-3 sm:p-4">
          <span className="text-[11px] font-medium text-[var(--modulr-text-muted)]">Fixed layout</span>
          <p className={roTitle}>{VALIDATOR_STATUS_PIE_UI.title}</p>
          <p className={`${roBody} mt-2`}>{VALIDATOR_STATUS_PIE_UI.description}</p>
          <label className="mt-3 block text-xs font-medium text-[var(--modulr-text-muted)]">
            Total (integer)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={values.metric_validators ?? ""}
            onChange={(e) =>
              onValueChange("metric_validators", e.target.value.replace(/\D/g, ""))
            }
            className={inp}
            placeholder="validator population for this split"
            autoComplete="off"
          />
          <p className="mt-2 text-[11px] font-medium text-[var(--modulr-text-muted)]">Slices</p>
          <div className="mt-2 space-y-2">
            {VALIDATOR_STATUS_PIE_UI.slices.map((sl) => (
              <div key={sl.pctKey} className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="text-[10px] text-[var(--modulr-text-muted)]">Label</label>
                  <div className={roTitle}>{sl.label}</div>
                </div>
                <div className="w-20 shrink-0">
                  <label className="text-[10px] text-[var(--modulr-text-muted)]">%</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={values[sl.pctKey] ?? ""}
                    onChange={(e) =>
                      onValueChange(sl.pctKey, e.target.value.replace(/\D/g, "").slice(0, 3))
                    }
                    className={inp}
                    placeholder="0–100"
                    autoComplete="off"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
          {NOTES_UI.title} (optional)
        </p>
        <div className="mt-3 rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 p-3 sm:p-4">
          <p className={roBody}>{NOTES_UI.description}</p>
          <textarea
            value={values[NOTES_UI.valueKey] ?? ""}
            onChange={(e) => onValueChange(NOTES_UI.valueKey, e.target.value)}
            rows={3}
            className={`${ta} mt-2`}
            placeholder="Optional"
            spellCheck
          />
        </div>
      </section>

      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
          Additional dashboard cards (7–10)
        </p>
        <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
          Up to {MAX_CUSTOM_DASHBOARD_CARDS} extra cards for the wire{" "}
          <code className="text-[var(--modulr-text)]">dashboard_cards</code> array (≥1 required). Empty title rows are
          skipped.
        </p>
        <div className="mt-3 space-y-4">
          {dashboard.cards.map((card, i) => (
            <div
              key={i}
              className="rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--modulr-text-muted)]">
                  Card {FIXED_STANDARD_METRIC_CARD_COUNT + i + 1}
                </span>
                {dashboard.cards.length > 1 ? (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-[var(--modulr-accent)] hover:underline"
                    onClick={() =>
                      setDashboard((d) => ({
                        ...d,
                        cards: d.cards.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <label className="mt-2 block text-xs font-medium text-[var(--modulr-text-muted)]">Title</label>
              <input
                type="text"
                value={card.title}
                onChange={(e) =>
                  setDashboard((d) => {
                    const cards = [...d.cards];
                    cards[i] = { ...cards[i]!, title: e.target.value };
                    return { ...d, cards };
                  })
                }
                className={inp}
                placeholder="e.g. Providers spotlight"
                autoComplete="off"
              />
              <label className="mt-2 block text-xs font-medium text-[var(--modulr-text-muted)]">Value</label>
              <input
                type="text"
                inputMode="numeric"
                value={card.value}
                onChange={(e) =>
                  setDashboard((d) => {
                    const cards = [...d.cards];
                    cards[i] = { ...cards[i]!, value: e.target.value.replace(/\D/g, "") };
                    return { ...d, cards };
                  })
                }
                className={inp}
                placeholder="integer"
                autoComplete="off"
              />
              <label className="mt-2 block text-xs font-medium text-[var(--modulr-text-muted)]">Description</label>
              <textarea
                value={card.description}
                onChange={(e) =>
                  setDashboard((d) => {
                    const cards = [...d.cards];
                    cards[i] = {
                      ...cards[i]!,
                      description: e.target.value.slice(0, MAX_CARD_DESCRIPTION_CHARS),
                    };
                    return { ...d, cards };
                  })
                }
                rows={2}
                className={ta}
                placeholder="What this card represents"
                spellCheck
              />
              <p className="mt-1 text-[10px] text-[var(--modulr-text-muted)] tabular-nums">
                {card.description.length}/{MAX_CARD_DESCRIPTION_CHARS}
              </p>
            </div>
          ))}
        </div>
        {dashboard.cards.length < MAX_CUSTOM_DASHBOARD_CARDS ? (
          <button
            type="button"
            className="mt-3 text-xs font-medium text-[var(--modulr-accent)] hover:underline"
            onClick={() => setDashboard((d) => ({ ...d, cards: [...d.cards, emptyCard()] }))}
          >
            + Add card
          </button>
        ) : null}
      </section>

      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
          Additional pie charts
        </p>
        <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
          Up to {MAX_DASHBOARD_PIES} custom pies for <code className="text-[var(--modulr-text)]">dashboard_pies</code>.
        </p>
        <div className="mt-3 space-y-5">
          {dashboard.pies.map((pie, pi) => (
            <div
              key={pi}
              className="rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--modulr-text-muted)]">
                  Custom pie {pi + 1}
                </span>
                <button
                  type="button"
                  className="text-[11px] font-medium text-[var(--modulr-accent)] hover:underline"
                  onClick={() =>
                    setDashboard((d) => ({
                      ...d,
                      pies: d.pies.filter((_, j) => j !== pi),
                    }))
                  }
                >
                  Remove pie
                </button>
              </div>
              <label className="mt-2 block text-xs font-medium text-[var(--modulr-text-muted)]">
                Total metric name
              </label>
              <input
                type="text"
                value={pie.metric_name}
                onChange={(e) =>
                  setDashboard((d) => {
                    const pies = [...d.pies];
                    pies[pi] = { ...pies[pi]!, metric_name: e.target.value };
                    return { ...d, pies };
                  })
                }
                className={inp}
                placeholder="e.g. Users by role"
                autoComplete="off"
              />
              <label className="mt-2 block text-xs font-medium text-[var(--modulr-text-muted)]">Total (integer)</label>
              <input
                type="text"
                inputMode="numeric"
                value={pie.total}
                onChange={(e) =>
                  setDashboard((d) => {
                    const pies = [...d.pies];
                    pies[pi] = { ...pies[pi]!, total: e.target.value.replace(/\D/g, "") };
                    return { ...d, pies };
                  })
                }
                className={inp}
                placeholder="population this pie summarizes"
                autoComplete="off"
              />
              <label className="mt-2 block text-xs font-medium text-[var(--modulr-text-muted)]">
                Chart description (optional)
              </label>
              <textarea
                value={pie.description}
                onChange={(e) =>
                  setDashboard((d) => {
                    const pies = [...d.pies];
                    pies[pi] = {
                      ...pies[pi]!,
                      description: e.target.value.slice(0, MAX_PIE_DESCRIPTION_CHARS),
                    };
                    return { ...d, pies };
                  })
                }
                rows={2}
                className={ta}
                placeholder="Optional context for the whole pie"
                spellCheck
              />
              <p className="mt-2 text-[11px] font-medium text-[var(--modulr-text-muted)]">Slices (≤{MAX_PIE_SLICES})</p>
              <div className="mt-2 space-y-2">
                {pie.slices.map((sl, si) => (
                  <div key={si} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label className="text-[10px] text-[var(--modulr-text-muted)]">Label</label>
                      <input
                        type="text"
                        value={sl.label}
                        onChange={(e) =>
                          setDashboard((d) => {
                            const pies = [...d.pies];
                            const slices = [...pies[pi]!.slices];
                            slices[si] = { ...slices[si]!, label: e.target.value };
                            pies[pi] = { ...pies[pi]!, slices };
                            return { ...d, pies };
                          })
                        }
                        className={inp}
                        placeholder="Slice name"
                        autoComplete="off"
                      />
                    </div>
                    <div className="w-20 shrink-0">
                      <label className="text-[10px] text-[var(--modulr-text-muted)]">%</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={sl.percent}
                        onChange={(e) =>
                          setDashboard((d) => {
                            const pies = [...d.pies];
                            const slices = [...pies[pi]!.slices];
                            const t = e.target.value.replace(/\D/g, "").slice(0, 3);
                            slices[si] = { ...slices[si]!, percent: t };
                            pies[pi] = { ...pies[pi]!, slices };
                            return { ...d, pies };
                          })
                        }
                        className={inp}
                        placeholder="0–100"
                        autoComplete="off"
                      />
                    </div>
                    {pie.slices.length > 1 ? (
                      <button
                        type="button"
                        className="mb-0.5 text-[10px] font-medium text-[var(--modulr-text-muted)] hover:text-[var(--modulr-accent)]"
                        onClick={() =>
                          setDashboard((d) => {
                            const pies = [...d.pies];
                            pies[pi] = {
                              ...pies[pi]!,
                              slices: pies[pi]!.slices.filter((_, j) => j !== si),
                            };
                            return { ...d, pies };
                          })
                        }
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {pie.slices.length < MAX_PIE_SLICES ? (
                <button
                  type="button"
                  className="mt-2 text-[11px] font-medium text-[var(--modulr-accent)] hover:underline"
                  onClick={() =>
                    setDashboard((d) => {
                      const pies = [...d.pies];
                      pies[pi] = { ...pies[pi]!, slices: [...pies[pi]!.slices, emptySlice()] };
                      return { ...d, pies };
                    })
                  }
                >
                  + Add slice
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {dashboard.pies.length < MAX_DASHBOARD_PIES ? (
          <button
            type="button"
            className="mt-3 text-xs font-medium text-[var(--modulr-accent)] hover:underline"
            onClick={() => setDashboard((d) => ({ ...d, pies: [...d.pies, emptyPie()] }))}
          >
            + Add pie chart
          </button>
        ) : null}
      </section>

      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
          Health & activity (24h)
        </p>
        <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
          Schema v2: hourly <code className="text-[var(--modulr-text)]">jobs_points</code> plus two labeled series on
          the wire. Each row is 24 non-negative numbers (comma-separated).
        </p>
        <div className="mt-3 space-y-4">
          <div className="rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 p-3 sm:p-4">
            <span className="text-[11px] font-medium text-[var(--modulr-text-muted)]">Fixed series</span>
            <p className={roTitle}>{HEALTH_JOBS_UI.title}</p>
            <p className={`${roBody} mt-2`}>{HEALTH_JOBS_UI.description}</p>
            <label className="mt-3 block text-xs font-medium text-[var(--modulr-text-muted)]">
              24 hourly values (comma-separated)
            </label>
            <textarea
              value={values[HEALTH_JOBS_UI.pointsKey] ?? ""}
              onChange={(e) => onValueChange(HEALTH_JOBS_UI.pointsKey, e.target.value)}
              rows={3}
              className={ta}
              placeholder="e.g. 120, 128, … (24 non-negative numbers)"
              spellCheck={false}
            />
          </div>
          {HEALTH_AUX_SERIES_UI.map((row) => (
            <div
              key={row.labelKey}
              className="rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 p-3 sm:p-4"
            >
              <span className="text-[11px] font-medium text-[var(--modulr-text-muted)]">{row.title}</span>
              <p className={`${roBody} mt-2`}>{row.description}</p>
              <label className="mt-3 block text-xs font-medium text-[var(--modulr-text-muted)]">Label</label>
              <input
                type="text"
                value={values[row.labelKey] ?? ""}
                onChange={(e) =>
                  onValueChange(row.labelKey, e.target.value.slice(0, HEALTH_AUX_LABEL_MAX_CHARS))
                }
                maxLength={HEALTH_AUX_LABEL_MAX_CHARS}
                className={inp}
                placeholder={`Required, max ${HEALTH_AUX_LABEL_MAX_CHARS} characters`}
                autoComplete="off"
              />
              <label className="mt-2 block text-xs font-medium text-[var(--modulr-text-muted)]">
                24 hourly values (comma-separated)
              </label>
              <textarea
                value={values[row.pointsKey] ?? ""}
                onChange={(e) => onValueChange(row.pointsKey, e.target.value)}
                rows={3}
                className={ta}
                placeholder="24 non-negative numbers"
                spellCheck={false}
              />
            </div>
          ))}
        </div>
        {healthPreview.ok ? (
          <HealthActivitySparkPreview series={healthPreview.series} />
        ) : (
          <p className="modulr-text-muted mt-3 text-[11px] leading-relaxed">
            Preview appears when all three rows parse (24 non-negative values each; aux labels non-empty, ≤{" "}
            {HEALTH_AUX_LABEL_MAX_CHARS} chars).
          </p>
        )}
      </section>
    </div>
  );
}

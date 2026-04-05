"use client";

import type { Dispatch, SetStateAction } from "react";

import type {
  DashboardCardInput,
  DashboardPieInput,
  ReportModuleDashboardState,
} from "@/lib/reportModuleStateDetail";
import {
  MAX_DASHBOARD_CARDS,
  MAX_DASHBOARD_PIES,
  MAX_CARD_DESCRIPTION_CHARS,
  MAX_PIE_DESCRIPTION_CHARS,
  MAX_PIE_SLICES,
} from "@/lib/reportModuleStateDetail";

const inp =
  "mt-1 w-full rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-3 py-2 text-sm text-[var(--modulr-text)] outline-none ring-[var(--modulr-accent)] placeholder:text-[var(--modulr-text-muted)] focus:ring-2";
const ta = `${inp} modulr-scrollbar resize-y font-mono text-xs leading-relaxed`;

const emptyCard = (): DashboardCardInput => ({ title: "", value: "", description: "" });
const emptySlice = () => ({ label: "", percent: "" });
const emptyPie = (): DashboardPieInput => ({
  metric_name: "",
  total: "",
  description: "",
  slices: [emptySlice(), emptySlice(), emptySlice()],
});

type Props = {
  dashboard: ReportModuleDashboardState;
  setDashboard: Dispatch<SetStateAction<ReportModuleDashboardState>>;
};

export function ReportModuleStateDashboardFields({ dashboard, setDashboard }: Props) {
  return (
    <div className="mt-6 space-y-6 border-t border-[var(--modulr-glass-border)] pt-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
          Dashboard cards
        </p>
        <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
          Up to {MAX_DASHBOARD_CARDS} cards — title, integer value, short description (≤{MAX_CARD_DESCRIPTION_CHARS}{" "}
          chars). Empty title rows are skipped.
        </p>
        <div className="mt-3 space-y-4">
          {dashboard.cards.map((card, i) => (
            <div
              key={i}
              className="rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--modulr-text-muted)]">Card {i + 1}</span>
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
                placeholder="e.g. Active jobs"
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
                    cards[i] = { ...cards[i]!, description: e.target.value.slice(0, MAX_CARD_DESCRIPTION_CHARS) };
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
        {dashboard.cards.length < MAX_DASHBOARD_CARDS ? (
          <button
            type="button"
            className="mt-3 text-xs font-medium text-[var(--modulr-accent)] hover:underline"
            onClick={() => setDashboard((d) => ({ ...d, cards: [...d.cards, emptyCard()] }))}
          >
            + Add card
          </button>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--modulr-text-muted)]">
          Dashboard pie charts
        </p>
        <p className="modulr-text-muted mt-1 text-[11px] leading-relaxed">
          Up to {MAX_DASHBOARD_PIES} pies. Each has a total metric name, total count (integer), optional chart
          description, and up to {MAX_PIE_SLICES} named slices whose % values sum to 100.
        </p>
        <div className="mt-3 space-y-5">
          {dashboard.pies.map((pie, pi) => (
            <div
              key={pi}
              className="rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/15 p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--modulr-text-muted)]">Pie {pi + 1}</span>
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
                placeholder="e.g. population this pie summarizes"
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
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { MockPieSlice } from "./mockModuleMetrics";

const VB = 200;
const CX = VB / 2;
const CY = VB / 2;
const R = 72;
const R_INNER = 44;

const nfPct = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const nfInt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function donutSlice(startAngle: number, endAngle: number): string {
  const ox1 = CX + R * Math.cos(startAngle);
  const oy1 = CY + R * Math.sin(startAngle);
  const ox2 = CX + R * Math.cos(endAngle);
  const oy2 = CY + R * Math.sin(endAngle);
  const ix1 = CX + R_INNER * Math.cos(startAngle);
  const iy1 = CY + R_INNER * Math.sin(startAngle);
  const ix2 = CX + R_INNER * Math.cos(endAngle);
  const iy2 = CY + R_INNER * Math.sin(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${ox1} ${oy1}`,
    `A ${R} ${R} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix2} ${iy2}`,
    `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${ix1} ${iy1}`,
    `Z`,
  ].join(" ");
}

type PathModel = {
  d: string;
  color: string;
  key: string;
  label: string;
  count: number;
};

function buildPaths(slices: MockPieSlice[]): { paths: PathModel[]; total: number } {
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (total <= 0) return { paths: [], total: 0 };

  let angle = -Math.PI / 2;
  const paths: PathModel[] = [];

  for (const sl of slices) {
    if (sl.count <= 0) continue;
    const sweep = (sl.count / total) * Math.PI * 2;
    if (sweep >= Math.PI * 2 - 1e-6) {
      paths.push({
        key: sl.key,
        label: sl.label,
        count: sl.count,
        color: sl.color,
        d: donutSlice(-Math.PI / 2, -Math.PI / 2 + Math.PI * 2 - 0.02),
      });
      break;
    }
    const end = angle + sweep;
    paths.push({
      key: sl.key,
      label: sl.label,
      count: sl.count,
      color: sl.color,
      d: donutSlice(angle, end),
    });
    angle = end;
  }

  return { paths, total };
}

export function MockDonutChart({
  slices,
  centerLabel,
  ariaLabel,
  legendMode = "hover",
}: {
  slices: MockPieSlice[];
  centerLabel: string;
  ariaLabel: string;
  /** `hover`: compact; `side`: legend beside chart (wide layouts). */
  legendMode?: "hover" | "side";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { paths, total } = useMemo(() => buildPaths(slices), [slices]);
  const [opacity, setOpacity] = useState(0);
  const [hover, setHover] = useState<{
    label: string;
    count: number;
    pct: number;
    tipX: number;
    tipY: number;
  } | null>(null);

  useEffect(() => {
    setOpacity(0);
    const id = window.setTimeout(() => setOpacity(1), 30);
    return () => window.clearTimeout(id);
  }, [slices]);

  const summary = useMemo(() => {
    if (total <= 0) return "No data.";
    return slices.map((s) => `${s.label}: ${nfInt.format(s.count)}`).join("; ");
  }, [slices, total]);

  const chartSvg = (
    <div ref={wrapRef} className="relative mx-auto shrink-0">
      <svg
        width={VB}
        height={VB}
        viewBox={`0 0 ${VB} ${VB}`}
        className="cursor-crosshair drop-shadow-sm"
        aria-label={ariaLabel}
        role="img"
        onMouseLeave={() => setHover(null)}
      >
        <circle
          cx={CX}
          cy={CY}
          r={R + 1}
          className="fill-[var(--modulr-page-bg)]/35"
          stroke="var(--modulr-glass-border)"
          strokeWidth={1}
        />
        {total <= 0 ? (
          <circle cx={CX} cy={CY} r={R} className="fill-[var(--modulr-glass-fill)]" />
        ) : (
          <g>
            {paths.map((p) => {
              const pct = (100 * p.count) / total;
              return (
                <path
                  key={p.key}
                  d={p.d}
                  fill={p.color}
                  stroke="var(--modulr-page-bg)"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  className="transition-[filter] duration-150 hover:brightness-110"
                  onMouseEnter={(e) => {
                    const wrap = wrapRef.current;
                    if (!wrap) return;
                    const rect = wrap.getBoundingClientRect();
                    setHover({
                      label: p.label,
                      count: p.count,
                      pct,
                      tipX: e.clientX - rect.left,
                      tipY: e.clientY - rect.top,
                    });
                  }}
                  onMouseMove={(e) => {
                    const wrap = wrapRef.current;
                    if (!wrap) return;
                    const rect = wrap.getBoundingClientRect();
                    setHover((prev) =>
                      prev
                        ? {
                            ...prev,
                            tipX: e.clientX - rect.left,
                            tipY: e.clientY - rect.top,
                          }
                        : null,
                    );
                  }}
                />
              );
            })}
          </g>
        )}
        <text
          x={CX}
          y={CY - 4}
          textAnchor="middle"
          className="fill-[var(--modulr-text-muted)] pointer-events-none"
          style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em" }}
        >
          {centerLabel}
        </text>
        <text
          x={CX}
          y={CY + 12}
          textAnchor="middle"
          className="fill-[var(--modulr-text)] pointer-events-none"
          style={{ fontSize: 15, fontWeight: 700 }}
        >
          {nfInt.format(total)}
        </text>
      </svg>

      {legendMode === "hover" && hover && total > 0 && (
        <div
          className="pointer-events-none absolute z-20 max-w-[200px] rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/95 px-3 py-2 text-left shadow-lg backdrop-blur-sm"
          style={{
            left: Math.min(
              Math.max(hover.tipX + 10, 8),
              (wrapRef.current?.clientWidth ?? VB) - 180,
            ),
            top: Math.max(hover.tipY - 8, 8),
            transform: "translateY(-100%)",
          }}
        >
          <p className="text-xs font-semibold text-[var(--modulr-text)]">{hover.label}</p>
          <p className="mt-0.5 text-[11px] text-[var(--modulr-text-muted)]">
            <span className="font-medium tabular-nums text-[var(--modulr-text)]">
              {nfInt.format(hover.count)}
            </span>
            <span className="mx-1">·</span>
            {nfPct.format(hover.pct)}%
            <span className="text-[var(--modulr-text-muted)]"> of total</span>
          </p>
        </div>
      )}
    </div>
  );

  const legend =
    legendMode === "side" ? (
      <ul className="min-w-0 flex-1 space-y-2.5" aria-label="Legend">
        {slices.map((sl) => {
          const pct = total > 0 ? (100 * sl.count) / total : 0;
          return (
            <li
              key={sl.key}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-[var(--modulr-glass-border)] border-opacity-60 pb-2 last:border-0 last:pb-0"
            >
              <span className="flex items-center gap-2 text-sm text-[var(--modulr-text)]">
                <span
                  className="inline-block size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: sl.color }}
                  aria-hidden
                />
                {sl.label}
              </span>
              <span className="tabular-nums text-sm text-[var(--modulr-text-muted)]">
                <span className="font-medium text-[var(--modulr-text)]">{nfInt.format(sl.count)}</span>
                <span className="mx-1.5 text-[var(--modulr-text-muted)]">·</span>
                {nfPct.format(pct)}%
              </span>
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <div
      className={
        legendMode === "side"
          ? "flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:gap-6"
          : "flex w-full flex-col items-center"
      }
      style={{ opacity, transition: "opacity 0.45s ease-out" }}
    >
      <p className="sr-only">{summary}</p>
      {chartSvg}
      {legend}
    </div>
  );
}

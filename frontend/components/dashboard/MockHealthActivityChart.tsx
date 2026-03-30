"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { hashString } from "./mockModuleMetrics";

const VB_W = 800;
const VB_H = 248;
const PAD = { t: 44, r: 16, b: 36, l: 48 };
const N = 56;
/** Minutes represented by one column (24h span, N−1 steps). */
const BUCKET_MINUTES = (24 * 60) / (N - 1);

const nfInt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** Gold series: relative activity level — mapped to mock req/min in the tooltip. */
function activitySeries(seedKey: string, n: number): number[] {
  const seed = hashString(seedKey);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const wave =
      Math.sin(t * Math.PI * 4 + seed * 0.0007) * 0.12 +
      Math.sin(t * Math.PI * 11 + seed * 0.0003) * 0.06;
    const trend = t * 0.18 + (seed % 17) * 0.001;
    const bump = ((seed >> (i % 12)) & 15) / 15 - 0.5;
    const spike = i % 23 === 0 ? bump * 0.06 : 0;
    let v = 0.48 + wave + trend + spike;
    v = Math.max(0.22, Math.min(0.96, v));
    out.push(v);
  }
  return out;
}

/** Red series: mock error counts per time bucket (spikes for visibility). */
function errorSeries(seedKey: string, n: number): number[] {
  const seed = hashString(seedKey + ":err");
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let v = 3 + (seed % 5) + ((seed >> (i % 9)) & 7);
    if (i % 19 === 4) v += 38 + (seed % 22);
    if (i % 27 === 10) v += 24 + ((seed >> 3) % 18);
    if (i % 31 === 17) v += 52 + (seed % 30);
    if (i % 41 === 6) v += 15;
    out.push(Math.min(130, v));
  }
  return out;
}

function activityReqPerMin(normalized: number): number {
  const lo = 0.22;
  const hi = 0.96;
  const t = (normalized - lo) / (hi - lo);
  return Math.round(220 + Math.min(1, Math.max(0, t)) * 3400);
}

function errorsPerMinute(bucketCount: number): number {
  return bucketCount / BUCKET_MINUTES;
}

/** Hours before “now” for column i (0 = 24h ago, N−1 = now). */
function hoursAgoLabel(i: number): string {
  const hoursFromStart = (i / (N - 1)) * 24;
  const hoursAgo = 24 - hoursFromStart;
  if (hoursAgo < 0.25) return "Now";
  if (hoursAgo < 1) return `${Math.round(hoursAgo * 60)}m ago`;
  return `${nf1.format(hoursAgo)}h ago`;
}

function buildChartModel(seedKey: string) {
  const hbVals = activitySeries(seedKey, N);
  const errVals = errorSeries(seedKey, N);

  const innerW = VB_W - PAD.l - PAD.r;
  const innerH = VB_H - PAD.t - PAD.b;
  const x0 = PAD.l;
  const yBase = VB_H - PAD.b;

  const hbBandH = innerH * 0.52;
  const ySplit = PAD.t + hbBandH;
  const errBandGap = 6;
  const errTop = ySplit + errBandGap;
  const errBandH = yBase - errTop;

  const errMax = Math.max(...errVals, 1);

  const hbPts = hbVals.map((v, i) => {
    const x = x0 + (i / (N - 1)) * innerW;
    const y = PAD.t + (1 - v) * hbBandH;
    return { x, y };
  });

  const errPts = errVals.map((v, i) => {
    const x = x0 + (i / (N - 1)) * innerW;
    const yn = v / errMax;
    const y = yBase - yn * errBandH;
    return { x, y };
  });

  const hbLineD = hbPts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const hbAreaD = `${hbLineD} L ${hbPts[N - 1]!.x.toFixed(1)} ${ySplit} L ${hbPts[0]!.x.toFixed(1)} ${ySplit} Z`;

  const errLineD = errPts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const errAreaD = `${errLineD} L ${errPts[N - 1]!.x.toFixed(1)} ${yBase} L ${errPts[0]!.x.toFixed(1)} ${yBase} Z`;

  return {
    hbLineD,
    hbAreaD,
    errLineD,
    errAreaD,
    ySplit,
    yBase,
    innerW,
    x0,
    hbVals,
    errVals,
    hbPts,
    errPts,
  };
}

function svgClientToViewBox(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  return pt.matrixTransform(ctm.inverse());
}

export function MockHealthActivityChart({ seedKey }: { seedKey: string }) {
  const uid = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const model = useMemo(() => buildChartModel(seedKey), [seedKey]);
  const {
    hbLineD,
    hbAreaD,
    errLineD,
    errAreaD,
    ySplit,
    yBase,
    innerW,
    x0,
    hbVals,
    errVals,
    hbPts,
    errPts,
  } = model;

  const [opacity, setOpacity] = useState(0);
  const [hover, setHover] = useState<{
    i: number;
    tipX: number;
    tipY: number;
  } | null>(null);

  useEffect(() => {
    setOpacity(0);
    const id = window.setTimeout(() => setOpacity(1), 30);
    return () => clearTimeout(id);
  }, [seedKey]);

  const xLabels = ["24h ago", "18h", "12h", "6h", "Now"];
  const gradHb = `mock-hb-${uid}`;
  const gradErr = `mock-err-${uid}`;

  function updateHover(clientX: number, clientY: number) {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    if (!svg || !wrap) return;
    const p = svgClientToViewBox(svg, clientX, clientY);
    if (!p) return;
    if (p.x < x0 || p.x > x0 + innerW || p.y < PAD.t || p.y > yBase) {
      setHover(null);
      return;
    }
    const fr = (p.x - x0) / innerW;
    const i = Math.round(fr * (N - 1));
    const clamped = Math.max(0, Math.min(N - 1, i));
    const rect = wrap.getBoundingClientRect();
    setHover({
      i: clamped,
      tipX: clientX - rect.left,
      tipY: clientY - rect.top,
    });
  }

  const hi = hover?.i;
  const activityNum = hi != null ? activityReqPerMin(hbVals[hi]!) : null;
  const errBucket = hi != null ? errVals[hi]! : null;
  const errRate = errBucket != null ? errorsPerMinute(errBucket) : null;

  return (
    <div
      ref={wrapRef}
      className="relative rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/25 px-2 py-3 sm:px-4"
      style={{
        opacity,
        transition: "opacity 0.45s ease-out",
      }}
    >
      <div className="mb-2 flex flex-col gap-2 px-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-xs font-medium text-[var(--modulr-text-muted)]">
            Activity & errors (mock)
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--modulr-text-muted)]">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: "var(--modulr-accent)" }}
              aria-hidden
            />
            Activity — network traffic
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--modulr-text-muted)]">
            <span className="inline-block size-2.5 rounded-full bg-red-500" aria-hidden />
            Errors
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[var(--modulr-text-muted)]">
          Demo · hover for values · ~{Math.round(BUCKET_MINUTES)}m / column
        </span>
      </div>
      <svg
        ref={svgRef}
        className="h-[220px] w-full cursor-crosshair sm:h-[248px]"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Mock activity and error chart; hover for numeric values."
        onMouseMove={(e) => updateHover(e.clientX, e.clientY)}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradHb} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--modulr-accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--modulr-accent)" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id={gradErr} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(239 68 68)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(239 68 68)" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((fr) => {
          const y = PAD.t + fr * (VB_H - PAD.t - PAD.b);
          return (
            <line
              key={fr}
              x1={PAD.l}
              y1={y}
              x2={VB_W - PAD.r}
              y2={y}
              stroke="var(--modulr-glass-border)"
              strokeWidth={1}
              strokeDasharray="4 6"
              opacity={0.55}
            />
          );
        })}

        <line
          x1={PAD.l}
          y1={ySplit}
          x2={VB_W - PAD.r}
          y2={ySplit}
          stroke="var(--modulr-glass-border)"
          strokeWidth={1}
          opacity={0.85}
        />
        <text
          x={PAD.l + 4}
          y={PAD.t + 12}
          className="fill-[var(--modulr-text-muted)]"
          style={{ fontSize: 10 }}
        >
          Activity (area)
        </text>
        <text
          x={PAD.l + 4}
          y={ySplit + 14}
          className="fill-red-500/90"
          style={{ fontSize: 10 }}
        >
          Errors (area)
        </text>

        <path d={hbAreaD} fill={`url(#${gradHb})`} />
        <path
          d={hbLineD}
          fill="none"
          stroke="var(--modulr-accent)"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path d={errAreaD} fill={`url(#${gradErr})`} />
        <path
          d={errLineD}
          fill="none"
          stroke="rgb(220 38 38)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hi != null && (
          <>
            <line
              x1={hbPts[hi]!.x}
              y1={PAD.t}
              x2={hbPts[hi]!.x}
              y2={yBase}
              stroke="var(--modulr-text-muted)"
              strokeWidth={1}
              strokeDasharray="3 4"
              opacity={0.75}
            />
            <circle
              cx={hbPts[hi]!.x}
              cy={hbPts[hi]!.y}
              r={4.5}
              fill="var(--modulr-page-bg)"
              stroke="var(--modulr-accent)"
              strokeWidth={2}
            />
            <circle
              cx={errPts[hi]!.x}
              cy={errPts[hi]!.y}
              r={4}
              fill="var(--modulr-page-bg)"
              stroke="rgb(220 38 38)"
              strokeWidth={2}
            />
          </>
        )}

        {xLabels.map((label, i) => {
          const x = PAD.l + (i / (xLabels.length - 1)) * (VB_W - PAD.l - PAD.r);
          return (
            <text
              key={label}
              x={x}
              y={VB_H - 8}
              textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}
              className="fill-[var(--modulr-text-muted)]"
              style={{ fontSize: 11 }}
            >
              {label}
            </text>
          );
        })}
      </svg>

      {hover && activityNum != null && errBucket != null && errRate != null && (
        <div
          className="pointer-events-none absolute z-20 max-w-[min(100%,220px)] rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/95 px-3 py-2 text-left shadow-lg backdrop-blur-sm"
          style={{
            left: Math.min(
              Math.max(hover.tipX + 12, 8),
              (wrapRef.current?.clientWidth ?? 0) - 228,
            ),
            top: Math.max(hover.tipY - 8, 8),
            transform: "translateY(-100%)",
          }}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--modulr-text-muted)]">
            {hoursAgoLabel(hover.i)}
          </p>
          <p className="mt-1 text-xs text-[var(--modulr-text)]">
            <span className="text-[var(--modulr-text-muted)]">Activity</span>{" "}
            <span className="font-medium tabular-nums" style={{ color: "var(--modulr-accent)" }}>
              {nfInt.format(activityNum)} req/min
            </span>
            <span className="text-[var(--modulr-text-muted)]"> (mock)</span>
          </p>
          <p className="mt-0.5 text-xs text-[var(--modulr-text)]">
            <span className="text-[var(--modulr-text-muted)]">Errors</span>{" "}
            <span className="font-medium tabular-nums text-red-600">
              {nf1.format(errRate)}/min
            </span>
            <span className="text-[var(--modulr-text-muted)]">
              {" "}
              · {nfInt.format(errBucket)} in ~{Math.round(BUCKET_MINUTES)}m window (mock)
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

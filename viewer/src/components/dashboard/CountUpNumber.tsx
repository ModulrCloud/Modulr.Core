"use client";

import { useEffect, useRef, useState } from "react";

const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function easeOutQuart(t: number) {
  return 1 - (1 - t) ** 4;
}

/**
 * Animates from the previous displayed value (or 0) to `value` when `value` changes.
 */
export function CountUpNumber({
  value,
  className = "",
  durationMs = 1650,
}: {
  value: number;
  className?: string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const start = displayRef.current;
    const end = value;
    const t0 = performance.now();

    function tick(now: number) {
      if (cancelled) return;
      const t = Math.min(1, (now - t0) / durationMs);
      const e = easeOutQuart(t);
      const v = Math.round(start + (end - start) * e);
      displayRef.current = v;
      setDisplay(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return <span className={`tabular-nums ${className}`.trim()}>{fmt.format(display)}</span>;
}

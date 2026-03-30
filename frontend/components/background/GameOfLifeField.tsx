"use client";

import { useEffect, useRef } from "react";

/** Target cell size in CSS pixels (grid resolution scales with viewport). */
const TARGET_CELL_CSS = 9;
/** Min interval between generations when animating (ms). */
const STEP_MS = 140;
/** Reseed after this many generations to keep the field lively. */
const MAX_GENS_BEFORE_RESEED = 2200;
/** Reseed if the board stops changing (fixed point). */
const STAGNANT_GENS_LIMIT = 140;
/** Reseed if almost everyone died. */
const MIN_POPULATION_FR = 0.0025;

const GOLD_R = 255;
const GOLD_G = 183;
const GOLD_B = 0;

function randomSeed(cols: number, rows: number): Uint8Array {
  const buf = new Uint8Array(cols * rows);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.random() < 0.32 ? 1 : 0;
  }
  return buf;
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function population(buf: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < buf.length; i++) n += buf[i];
  return n;
}

function stepConway(
  cur: Uint8Array,
  next: Uint8Array,
  cols: number,
  rows: number,
): void {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = (x + dx + cols) % cols;
          const ny = (y + dy + rows) % rows;
          n += cur[ny * cols + nx];
        }
      }
      const alive = cur[y * cols + x];
      let v = 0;
      if (alive) {
        if (n === 2 || n === 3) v = 1;
      } else if (n === 3) {
        v = 1;
      }
      next[y * cols + x] = v;
    }
  }
}

function drawGrid(
  octx: CanvasRenderingContext2D,
  cur: Uint8Array,
  cols: number,
  rows: number,
): void {
  const img = octx.createImageData(cols, rows);
  const d = img.data;
  for (let i = 0, p = 0; i < cur.length; i++, p += 4) {
    if (cur[i]) {
      d[p] = GOLD_R;
      d[p + 1] = GOLD_G;
      d[p + 2] = GOLD_B;
      d[p + 3] = 255;
    } else {
      d[p + 3] = 0;
    }
  }
  octx.putImageData(img, 0, 0);
}

/**
 * Conway’s Game of Life on a torus, solid Modulr gold live cells — retro grid scaled up crisp.
 */
export function GameOfLifeField({
  visible,
  animate,
}: {
  visible: boolean;
  animate: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const curRef = useRef<Uint8Array | null>(null);
  const nextRef = useRef<Uint8Array | null>(null);
  const dimsRef = useRef({ cols: 0, rows: 0 });
  const raf = useRef(0);
  const lastStep = useRef(0);
  const stagnant = useRef(0);
  const genCount = useRef(0);

  useEffect(() => {
    if (!visible) {
      if (raf.current) cancelAnimationFrame(raf.current);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function ensureOffscreen(cols: number, rows: number) {
      let off = offRef.current;
      if (!off || off.width !== cols || off.height !== rows) {
        off = document.createElement("canvas");
        off.width = cols;
        off.height = rows;
        offRef.current = off;
      }
      return off;
    }

    function resizeAndMaybeSeed(forceSeed: boolean) {
      const el = ref.current;
      if (!el) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      el.width = Math.floor(W * dpr);
      el.height = Math.floor(H * dpr);
      el.style.width = `${W}px`;
      el.style.height = `${H}px`;
      const c = el.getContext("2d", { alpha: true });
      if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.max(40, Math.min(200, Math.floor(W / TARGET_CELL_CSS)));
      const rows = Math.max(28, Math.min(120, Math.floor(H / TARGET_CELL_CSS)));
      const { cols: oc, rows: or } = dimsRef.current;
      if (forceSeed || cols !== oc || rows !== or) {
        dimsRef.current = { cols, rows };
        curRef.current = randomSeed(cols, rows);
        nextRef.current = new Uint8Array(cols * rows);
        stagnant.current = 0;
        genCount.current = 0;
      }
    }

    resizeAndMaybeSeed(true);
    lastStep.current = performance.now();

    const onResize = () => {
      resizeAndMaybeSeed(true);
    };
    window.addEventListener("resize", onResize);

    function reseed() {
      const { cols, rows } = dimsRef.current;
      if (!cols || !rows) return;
      curRef.current = randomSeed(cols, rows);
      stagnant.current = 0;
      genCount.current = 0;
    }

    function frame(now: number) {
      const canvasEl = ref.current;
      const ctx = canvasEl?.getContext("2d", { alpha: true });
      if (!canvasEl || !ctx) return;

      const W = window.innerWidth;
      const H = window.innerHeight;
      const { cols, rows } = dimsRef.current;
      const cur = curRef.current;
      const next = nextRef.current;
      if (!cur || !next || !cols || !rows) {
        raf.current = requestAnimationFrame(frame);
        return;
      }

      const off = ensureOffscreen(cols, rows);
      const octx = off.getContext("2d", { alpha: true });
      if (!octx) {
        raf.current = requestAnimationFrame(frame);
        return;
      }

      if (animate && now - lastStep.current >= STEP_MS) {
        lastStep.current = now;
        stepConway(cur, next, cols, rows);
        genCount.current += 1;

        const pop = population(next);
        const minPop = Math.max(12, cols * rows * MIN_POPULATION_FR);
        if (arraysEqual(cur, next)) {
          stagnant.current += 1;
        } else {
          stagnant.current = 0;
        }

        if (
          pop < minPop ||
          stagnant.current > STAGNANT_GENS_LIMIT ||
          genCount.current > MAX_GENS_BEFORE_RESEED
        ) {
          reseed();
          drawGrid(octx, curRef.current!, cols, rows);
        } else {
          const tmp = curRef.current;
          curRef.current = nextRef.current;
          nextRef.current = tmp!;
          drawGrid(octx, curRef.current!, cols, rows);
        }
      } else {
        drawGrid(octx, cur, cols, rows);
      }

      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, cols, rows, 0, 0, W, H);
      ctx.restore();

      raf.current = requestAnimationFrame(frame);
    }

    raf.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf.current);
    };
  }, [visible, animate]);

  if (!visible) return null;

  return (
    <canvas
      ref={ref}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      aria-hidden
    />
  );
}

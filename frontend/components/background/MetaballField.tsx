"use client";

import { useEffect, useRef } from "react";

type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Elliptical field axes (1 = circle); used for wall “squish” then relax toward 1. */
  sx: number;
  sy: number;
};

type MergeAnimState = {
  a: Ball;
  b: Ball;
  merged: Ball;
  start: number;
  duration: number;
};

const MIN_BALLS = 5;
const MAX_BALLS = 12;
/** After a split, wait before another (size-based split only). */
const SPLIT_COOLDOWN_MS = 1900;
/**
 * Every blob is held in this speed band after each tick so the field never idles,
 * including right after merge/split when momentum averaging kills velocity.
 */
const SPEED_FLOOR = 0.22;
const SPEED_CEILING = 0.52;
/**
 * Internal field resolution (fraction of viewport). Higher = sharper edges;
 * capped below so huge viewports stay smooth.
 */
const GRID_SCALE = 0.42;
/** Max grid cells per frame (~gw×gh); raise if machines have headroom. */
const MAX_FIELD_CELLS = 400_000;
/**
 * Metaball iso-surface band in field space: smoothstep(edge0, edge1, f) → alpha.
 * Slightly tighter band + higher grid = crisper silhouette.
 */
const FIELD_EDGE0 = 0.88;
const FIELD_EDGE1 = 1.06;
const MAX_RADIUS_FR = 0.085;
const MIN_RADIUS_PX = 20;
/** Upper / lower bands: gentle push so blobs circulate instead of hugging one edge. */
const CHURN_STRENGTH = 0.00014;
/** Wall squish eases back to round; higher retain = slower recovery (closer to 1). */
const SQUASH_RETAIN_MIN = 0.91;
const SQUASH_RETAIN_MAX = 0.978;
/** Crossfade two sources → one merged ball (ms); avoids a hard swap pop. */
const MERGE_BLEND_MS = 640;

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (x <= edge0) return 0;
  if (x >= edge1) return 1;
  const t = (x - edge0) / (edge1 - edge0);
  return t * t * (3 - 2 * t);
}

function dist(a: Ball, b: Ball): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function enforceSpeedBand(b: Ball) {
  const s = Math.hypot(b.vx, b.vy);
  if (s < 1e-5) {
    const ang = Math.random() * Math.PI * 2;
    const sp = SPEED_FLOOR + Math.random() * (SPEED_CEILING - SPEED_FLOOR) * 0.35;
    b.vx = Math.cos(ang) * sp;
    b.vy = Math.sin(ang) * sp;
    return;
  }
  if (s < SPEED_FLOOR) {
    const k = SPEED_FLOOR / s;
    b.vx *= k;
    b.vy *= k;
    return;
  }
  if (s > SPEED_CEILING) {
    const k = SPEED_CEILING / s;
    b.vx *= k;
    b.vy *= k;
  }
}

function seedBalls(w: number, h: number): Ball[] {
  const maxR = Math.min(w, h) * MAX_RADIUS_FR;
  const n = 8;
  const balls: Ball[] = [];
  for (let i = 0; i < n; i++) {
    const r = MIN_RADIUS_PX + Math.random() * (maxR - MIN_RADIUS_PX);
    const ang = Math.random() * Math.PI * 2;
    const sp =
      SPEED_FLOOR + Math.random() * (SPEED_CEILING - SPEED_FLOOR) * 0.85;
    balls.push({
      x: r + Math.random() * (w - 2 * r),
      y: r + Math.random() * (h - 2 * r),
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r,
      sx: 1,
      sy: 1,
    });
  }
  return balls;
}

function snapshotBall(b: Ball): Ball {
  return {
    x: b.x,
    y: b.y,
    vx: b.vx,
    vy: b.vy,
    r: b.r,
    sx: b.sx,
    sy: b.sy,
  };
}

/** If a pair is touching, remove them from the list and start a blend (caller sets ref). */
function beginMerge(
  balls: Ball[],
  onStart: (a: Ball, b: Ball, merged: Ball) => void,
): Ball[] {
  if (balls.length <= MIN_BALLS) return balls;
  let bi = -1;
  let bj = -1;
  let best = Infinity;
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      const d = dist(a, b);
      const mergeDist = (a.r + b.r) * 0.62;
      if (d < mergeDist && d < best) {
        best = d;
        bi = i;
        bj = j;
      }
    }
  }
  if (bi < 0 || bj < 0) return balls;
  const a = balls[bi];
  const b = balls[bj];
  const wa = a.r * a.r;
  const wb = b.r * b.r;
  const nx = (a.x * wa + b.x * wb) / (wa + wb);
  const ny = (a.y * wa + b.y * wb) / (wa + wb);
  const nvx = (a.vx * wa + b.vx * wb) / (wa + wb);
  const nvy = (a.vy * wa + b.vy * wb) / (wa + wb);
  const nr = Math.sqrt(wa + wb) * 0.9;
  const maxR = Math.min(typeof window !== "undefined" ? window.innerWidth : 800, typeof window !== "undefined" ? window.innerHeight : 600) * MAX_RADIUS_FR;
  const merged: Ball = {
    x: nx,
    y: ny,
    vx: nvx,
    vy: nvy,
    r: Math.min(nr, maxR * 1.05),
    sx: 1,
    sy: 1,
  };
  enforceSpeedBand(merged);
  onStart(snapshotBall(a), snapshotBall(b), merged);
  return balls.filter((_, k) => k !== bi && k !== bj);
}

function metaballContrib(
  px: number,
  py: number,
  ball: { x: number; y: number; r: number; sx: number; sy: number },
): number {
  const dx = px - ball.x;
  const dy = py - ball.y;
  const sx = ball.sx > 0.2 ? ball.sx : 1;
  const sy = ball.sy > 0.2 ? ball.sy : 1;
  const d2 = (dx * dx) / (sx * sx) + (dy * dy) / (sy * sy) + 2;
  return (ball.r * ball.r) / d2;
}

/** Field from the pair gliding together + late crossfade to the merged kernel (no hard swap). */
function mergeAnimContrib(
  px: number,
  py: number,
  m: MergeAnimState,
  now: number,
): number {
  const elapsed = now - m.start;
  const pLin = Math.min(1, elapsed / m.duration);
  const pEase = 1 - (1 - pLin) ** 3;
  const posAx = m.a.x + (m.merged.x - m.a.x) * pEase;
  const posAy = m.a.y + (m.merged.y - m.a.y) * pEase;
  const posBx = m.b.x + (m.merged.x - m.b.x) * pEase;
  const posBy = m.b.y + (m.merged.y - m.b.y) * pEase;
  const rA = m.a.r + (m.merged.r - m.a.r) * pEase;
  const rB = m.b.r + (m.merged.r - m.b.r) * pEase;
  const oval = Math.sin(Math.PI * pLin);
  const sxA = Math.max(0.55, m.a.sx * (1 + 0.12 * oval));
  const syA = Math.max(0.55, m.a.sy * (1 - 0.06 * oval));
  const sxB = Math.max(0.55, m.b.sx * (1 + 0.12 * oval));
  const syB = Math.max(0.55, m.b.sy * (1 - 0.06 * oval));
  const fPair =
    metaballContrib(px, py, { x: posAx, y: posAy, r: rA, sx: sxA, sy: syA }) +
    metaballContrib(px, py, { x: posBx, y: posBy, r: rB, sx: sxB, sy: syB });
  const fOne = metaballContrib(px, py, m.merged);
  const w = smoothstep(0.36, 0.94, pLin);
  return (1 - w) * fPair + w * fOne;
}

function trySplit(balls: Ball[], w: number, h: number): Ball[] {
  if (balls.length >= MAX_BALLS) return balls;
  const maxR = Math.min(w, h) * MAX_RADIUS_FR;
  const idx = balls.findIndex((b) => b.r > maxR * 0.72);
  if (idx < 0) return balls;
  const b = balls[idx];
  const nr = b.r * 0.62;
  const sep = nr * 0.85;
  const u = Math.random() * Math.PI * 2;
  const ox = Math.cos(u) * sep;
  const oy = Math.sin(u) * sep;
  const outward = 0.26 + Math.random() * 0.16;
  const one: Ball = {
    x: Math.max(nr, Math.min(w - nr, b.x - ox)),
    y: Math.max(nr, Math.min(h - nr, b.y - oy)),
    vx: b.vx * 0.55 - Math.cos(u) * outward,
    vy: b.vy * 0.55 - Math.sin(u) * outward,
    r: nr,
    sx: 1,
    sy: 1,
  };
  const two: Ball = {
    x: Math.max(nr, Math.min(w - nr, b.x + ox)),
    y: Math.max(nr, Math.min(h - nr, b.y + oy)),
    vx: b.vx * 0.55 + Math.cos(u) * outward,
    vy: b.vy * 0.55 + Math.sin(u) * outward,
    r: nr,
    sx: 1,
    sy: 1,
  };
  enforceSpeedBand(one);
  enforceSpeedBand(two);
  return balls.filter((_, k) => k !== idx).concat(one, two);
}

function squashVertical(b: Ball) {
  b.sy *= 0.78;
  b.sx *= 1.06;
  b.sx = Math.min(1.32, b.sx);
  b.sy = Math.max(0.55, b.sy);
}

function squashHorizontal(b: Ball) {
  b.sx *= 0.78;
  b.sy *= 1.06;
  b.sx = Math.max(0.55, b.sx);
  b.sy = Math.min(1.32, b.sy);
}

function stepPhysics(balls: Ball[], w: number, h: number, dt: number) {
  const damp = Math.pow(0.9985, dt / 16);
  const wander = 0.015 * (dt / 16);
  const move = 0.09;
  for (const b of balls) {
    if (typeof b.sx !== "number" || typeof b.sy !== "number") {
      b.sx = 1;
      b.sy = 1;
    }
    const speed = Math.hypot(b.vx, b.vy);
    const retain = Math.min(
      SQUASH_RETAIN_MAX,
      Math.max(SQUASH_RETAIN_MIN, 0.934 - speed * 0.038),
    );
    const squashRelax = 1 - Math.pow(retain, dt / 16);
    b.sx += (1 - b.sx) * squashRelax;
    b.sy += (1 - b.sy) * squashRelax;
    b.sx = Math.min(1.38, Math.max(0.52, b.sx));
    b.sy = Math.min(1.38, Math.max(0.52, b.sy));

    const ang = (Math.random() - 0.5) * wander;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const vx = b.vx * c - b.vy * s;
    const vy = b.vx * s + b.vy * c;
    b.vx = vx;
    b.vy = vy;
    b.vx *= damp;
    b.vy *= damp;

    const yn = b.y / h;
    if (yn < 0.36) b.vy += CHURN_STRENGTH * (0.36 - yn) * dt;
    else if (yn > 0.64) b.vy -= CHURN_STRENGTH * (yn - 0.64) * dt;

    b.x += b.vx * dt * move;
    b.y += b.vy * dt * move;
    if (b.x < b.r) {
      b.x = b.r;
      b.vx = Math.abs(b.vx) * 0.92;
      squashHorizontal(b);
    }
    if (b.x > w - b.r) {
      b.x = w - b.r;
      b.vx = -Math.abs(b.vx) * 0.92;
      squashHorizontal(b);
    }
    if (b.y < b.r) {
      b.y = b.r;
      b.vy = Math.abs(b.vy) * 0.92;
      squashVertical(b);
    }
    if (b.y > h - b.r) {
      b.y = h - b.r;
      b.vy = -Math.abs(b.vy) * 0.92;
      squashVertical(b);
    }
  }
}

/**
 * Meta balls preset: 5–12 blobs, merge/split; sim follows display refresh.
 * Always Modulr gold — frosted UI keeps copy readable on top.
 */
export function MetaballField({
  visible,
  animate,
}: {
  visible: boolean;
  animate: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const ballsRef = useRef<Ball[] | null>(null);
  const raf = useRef<number>(0);
  const lastTick = useRef(0);
  const lastSplitTime = useRef(0);
  const mergeAnimRef = useRef<MergeAnimState | null>(null);

  useEffect(() => {
    if (!visible) {
      if (raf.current) cancelAnimationFrame(raf.current);
      mergeAnimRef.current = null;
      return;
    }

    const cnv = ref.current;
    if (!cnv) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function ensureOffscreen(gw: number, gh: number) {
      let off = offRef.current;
      if (!off || off.width !== gw || off.height !== gh) {
        off = document.createElement("canvas");
        off.width = gw;
        off.height = gh;
        offRef.current = off;
      }
      return off;
    }

    function resize() {
      const el = ref.current;
      if (!el) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      el.width = Math.floor(w * dpr);
      el.height = Math.floor(h * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      const c = el.getContext("2d", { alpha: true });
      if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!ballsRef.current) ballsRef.current = seedBalls(w, h);
      else {
        const bs = ballsRef.current;
        for (const b of bs) {
          if (typeof b.sx !== "number" || typeof b.sy !== "number") {
            b.sx = 1;
            b.sy = 1;
          }
          b.x = Math.min(Math.max(b.x, b.r), w - b.r);
          b.y = Math.min(Math.max(b.y, b.r), h - b.r);
        }
      }
    }

    resize();
    const w = () => window.innerWidth;
    const h = () => window.innerHeight;

    const onResize = () => {
      resize();
    };
    window.addEventListener("resize", onResize);

    /** Modulr gold (#ffb700) in both themes. */
    const MB_R = 255;
    const MB_G = 183;
    const MB_B = 0;
    const MB_A = 200;

    function drawField(
      ctx: CanvasRenderingContext2D,
      gw: number,
      gh: number,
      balls: Ball[],
      now: number,
    ) {
      const off = ensureOffscreen(gw, gh);
      const octx = off.getContext("2d", { alpha: true });
      if (!octx) return;
      const img = octx.createImageData(gw, gh);
      const data = img.data;
      const W = w();
      const H = h();
      const mergeA = mergeAnimRef.current;
      for (let j = 0; j < gh; j++) {
        const py = ((j + 0.5) / gh) * H;
        for (let i = 0; i < gw; i++) {
          const px = ((i + 0.5) / gw) * W;
          let f = 0;
          for (const ball of balls) {
            f += metaballContrib(px, py, ball);
          }
          if (mergeA) {
            f += mergeAnimContrib(px, py, mergeA, now);
          }
          const idx = (j * gw + i) << 2;
          const cover = smoothstep(FIELD_EDGE0, FIELD_EDGE1, f);
          const ai = Math.min(255, Math.round(MB_A * cover));
          if (ai <= 0) {
            data[idx + 3] = 0;
          } else {
            data[idx] = MB_R;
            data[idx + 1] = MB_G;
            data[idx + 2] = MB_B;
            data[idx + 3] = ai;
          }
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(off, 0, 0, gw, gh, 0, 0, W, H);
      ctx.restore();
    }

    function frame(now: number) {
      const canvasEl = ref.current;
      const ctx = canvasEl?.getContext("2d", { alpha: true });
      if (!canvasEl || !ctx) return;

      const W = w();
      const H = h();
      let gw = Math.max(48, Math.floor(W * GRID_SCALE));
      let gh = Math.max(36, Math.floor(H * GRID_SCALE));
      const area = gw * gh;
      if (area > MAX_FIELD_CELLS) {
        const scale = Math.sqrt(MAX_FIELD_CELLS / area);
        gw = Math.max(48, Math.floor(gw * scale));
        gh = Math.max(36, Math.floor(gh * scale));
      }

      let balls = ballsRef.current;
      if (!balls) balls = seedBalls(W, H);
      if (mergeAnimRef.current) {
        const m = mergeAnimRef.current;
        if (now - m.start >= m.duration) {
          balls = [...balls, m.merged];
          mergeAnimRef.current = null;
        }
      }
      if (animate) {
        const dt = Math.min(48, Math.max(4, now - lastTick.current || 16));
        lastTick.current = now;
        stepPhysics(balls, W, H, dt);
        const nBefore = balls.length;
        if (now - lastSplitTime.current >= SPLIT_COOLDOWN_MS) {
          balls = trySplit(balls, W, H);
          if (balls.length > nBefore) lastSplitTime.current = now;
        }
        if (!mergeAnimRef.current) {
          balls = beginMerge(balls, (a, b, merged) => {
            mergeAnimRef.current = {
              a,
              b,
              merged,
              start: now,
              duration: MERGE_BLEND_MS,
            };
          });
        }
        for (const b of balls) enforceSpeedBand(b);
      }
      ballsRef.current = balls;

      drawField(ctx, gw, gh, balls, now);
      if (animate) {
        raf.current = requestAnimationFrame(frame);
      }
    }

    lastTick.current = performance.now();
    raf.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      mergeAnimRef.current = null;
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

"use client";

import { useEffect, useRef, useState } from "react";

type ColorMode = "dark" | "light";

/** Modulr accent — paddle + ball */
const ACCENT_GOLD = { r: 255, g: 183, b: 0 };
/** Secondary / brick accent (#FFD857) */
const BRICK = { r: 255, g: 216, b: 87 };

const PADDLE_MARGIN_LEFT = 44;
const PADDLE_THICK = 11;
const PADDLE_LEN_MIN = 96;
const PADDLE_LEN_MAX = 168;
const BALL_R = 7;
const BALL_SPEED_MIN = 280;
const BALL_SPEED_MAX = 400;
const PADDLE_LERP = 0.13;
const PADDLE_MAX_SPEED = 480;
/** Paddle stays idle until the ball crosses this fraction of width; then tracks for the whole rally (including return). */
const TRACK_AFTER_X_FR = 0.2;
const FAIL_X = 10;
/** Pause with win message before rebuilding the wall (ms). */
const WIN_CELEBRATION_MS = 2800;

type Brick = { x: number; y: number; w: number; h: number; alive: boolean };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function len(x: number, y: number) {
  return Math.hypot(x, y);
}

/** Launch toward the right with slight vertical spread. */
function randomBallVelocity(): { vx: number; vy: number } {
  const sp = BALL_SPEED_MIN + Math.random() * (BALL_SPEED_MAX - BALL_SPEED_MIN);
  const spread = (Math.random() - 0.5) * (Math.PI * 0.34);
  return { vx: Math.cos(spread) * sp, vy: Math.sin(spread) * sp };
}

/**
 * Brick wall on the right: **tall narrow** bricks (vertical planks), full usable height.
 */
function buildBricks(w: number, h: number): Brick[] {
  const marginR = w * 0.05;
  const marginTop = h * 0.055;
  const marginBottom = h * 0.03;
  const gap = 6;
  const availH = h - marginTop - marginBottom;
  /** ~2× prior brick height; row count scales down so the wall still fills the viewport. */
  const minRowH = 38;
  const rows = clamp(Math.floor((availH + gap) / (minRowH + gap)), 8, 28);
  const bh = (availH - gap * (rows - 1)) / rows;
  const bw = clamp(bh / 2.35, 20, 52);
  const cols = clamp(Math.floor((w * 0.44) / (bw + gap)), 4, 12);
  const bricks: Brick[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (Math.random() > 0.78) continue;
      const x = w - marginR - bw - c * (bw + gap);
      const y = marginTop + r * (bh + gap);
      bricks.push({ x, y, w: bw, h: bh, alive: true });
    }
  }
  if (bricks.length < 8) {
    return buildBricks(w, h);
  }
  return bricks;
}

function circleAABBCollision(
  bx: number,
  by: number,
  br: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): { nx: number; ny: number; pen: number } | null {
  const cx = clamp(bx, rx, rx + rw);
  const cy = clamp(by, ry, ry + rh);
  let dx = bx - cx;
  let dy = by - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= br * br) return null;
  const d = Math.sqrt(d2);
  if (d < 1e-4) {
    const penL = bx - rx;
    const penR = rx + rw - bx;
    const penT = by - ry;
    const penB = ry + rh - by;
    const m = Math.min(penL, penR, penT, penB);
    if (m === penT) return { nx: 0, ny: -1, pen: br + m };
    if (m === penB) return { nx: 0, ny: 1, pen: br + m };
    if (m === penL) return { nx: -1, ny: 0, pen: br + m };
    return { nx: 1, ny: 0, pen: br + m };
  }
  dx /= d;
  dy /= d;
  return { nx: dx, ny: dy, pen: br - d };
}

/**
 * Brick preset: vertical paddle on the left, bricks on the right; top/bottom walls.
 */
export function BrickField({
  visible,
  animate,
  colorMode,
}: {
  visible: boolean;
  animate: boolean;
  colorMode: ColorMode;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const modeRef = useRef(colorMode);
  modeRef.current = colorMode;
  const [winBanner, setWinBanner] = useState(false);

  useEffect(() => {
    if (!visible) {
      if (raf.current) cancelAnimationFrame(raf.current);
      setWinBanner(false);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const ball = { x: 0, y: 0, vx: 0, vy: 0, r: BALL_R };
    /** Vertical paddle: narrow w (x extent), tall h (y extent), center (x,y). */
    const paddle = { x: 0, y: 0, w: PADDLE_THICK, h: PADDLE_LEN_MIN };
    let bricks: Brick[] = [];
    let aimJitter = 0;
    let aimJitterTarget = 0;
    let jitterAccum = 0;
    let paddleEngaged = false;
    let celebrationUntil = 0;

    function paddleLenFor(h: number) {
      return clamp(h * 0.15, PADDLE_LEN_MIN, PADDLE_LEN_MAX);
    }

    function resetBall(w: number, h: number) {
      paddle.h = paddleLenFor(h);
      paddle.x = PADDLE_MARGIN_LEFT + paddle.w / 2;
      paddle.y = h / 2 + (Math.random() - 0.5) * h * 0.12;
      paddle.y = clamp(paddle.y, paddle.h / 2 + 10, h - paddle.h / 2 - 10);
      aimJitter = 0;
      aimJitterTarget = (Math.random() * 2 - 1) * paddle.h * 0.2;
      jitterAccum = 0;
      paddleEngaged = false;

      const v = randomBallVelocity();
      ball.x = paddle.x + paddle.w / 2 + ball.r + 5;
      ball.y = paddle.y;
      ball.vx = Math.abs(v.vx);
      ball.vy = v.vy;
      ball.r = BALL_R;
    }

    function newLevel(w: number, h: number) {
      bricks = buildBricks(w, h);
      resetBall(w, h);
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
      newLevel(w, h);
    }

    resize();
    let lastT = performance.now();

    const onResize = () => {
      resize();
      lastT = performance.now();
    };
    window.addEventListener("resize", onResize);

    function reflect(nx: number, ny: number) {
      const dot = ball.vx * nx + ball.vy * ny;
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;
    }

    function step(dt: number, w: number, h: number) {
      const now = performance.now();
      if (celebrationUntil > 0) {
        if (now >= celebrationUntil) {
          celebrationUntil = 0;
          setWinBanner(false);
          newLevel(w, h);
        }
        return;
      }

      jitterAccum += dt;
      if (jitterAccum > 650 + Math.random() * 400) {
        jitterAccum = 0;
        aimJitterTarget = (Math.random() * 2 - 1) * paddle.h * 0.22;
      }
      aimJitter += (aimJitterTarget - aimJitter) * Math.min(1, dt * 0.003);

      const trackThreshold = w * TRACK_AFTER_X_FR;
      if (ball.x >= trackThreshold) {
        paddleEngaged = true;
      }
      if (paddleEngaged) {
        const targetY = ball.y + aimJitter;
        const dy = targetY - paddle.y;
        const stepMax = (PADDLE_MAX_SPEED * dt) / 1000;
        paddle.y += clamp(dy * PADDLE_LERP, -stepMax, stepMax);
      }
      paddle.y = clamp(paddle.y, paddle.h / 2 + 8, h - paddle.h / 2 - 8);

      ball.x += (ball.vx * dt) / 1000;
      ball.y += (ball.vy * dt) / 1000;

      if (ball.y < ball.r) {
        ball.y = ball.r;
        ball.vy = Math.abs(ball.vy);
      }
      if (ball.y > h - ball.r) {
        ball.y = h - ball.r;
        ball.vy = -Math.abs(ball.vy);
      }
      if (ball.x > w - ball.r) {
        ball.x = w - ball.r;
        ball.vx = -Math.abs(ball.vx);
      }

      const pL = paddle.x - paddle.w / 2;
      const pT = paddle.y - paddle.h / 2;
      const hitPad = circleAABBCollision(ball.x, ball.y, ball.r, pL, pT, paddle.w, paddle.h);
      if (hitPad && ball.vx < 0) {
        ball.x -= hitPad.nx * hitPad.pen;
        ball.y -= hitPad.ny * hitPad.pen;
        const u = clamp((ball.y - paddle.y) / (paddle.h * 0.5), -1, 1);
        let speed = len(ball.vx, ball.vy);
        speed = clamp(speed, BALL_SPEED_MIN, BALL_SPEED_MAX);
        const theta = u * (Math.PI * 0.4);
        ball.vx = Math.cos(theta) * speed;
        ball.vy = Math.sin(theta) * speed;
        if (ball.vx < 140) ball.vx = 140;
      }

      for (const b of bricks) {
        if (!b.alive) continue;
        const hit = circleAABBCollision(ball.x, ball.y, ball.r, b.x, b.y, b.w, b.h);
        if (hit) {
          b.alive = false;
          ball.x -= hit.nx * hit.pen;
          ball.y -= hit.ny * hit.pen;
          reflect(hit.nx, hit.ny);
          break;
        }
      }

      if (ball.x - ball.r < FAIL_X) {
        resetBall(w, h);
      }

      if (!bricks.some((b) => b.alive)) {
        celebrationUntil = now + WIN_CELEBRATION_MS;
        setWinBanner(true);
      }

      const sp = len(ball.vx, ball.vy);
      if (sp < BALL_SPEED_MIN) {
        const s = BALL_SPEED_MIN / sp;
        ball.vx *= s;
        ball.vy *= s;
      }
      if (sp > BALL_SPEED_MAX * 1.15) {
        const s = (BALL_SPEED_MAX * 1.15) / sp;
        ball.vx *= s;
        ball.vy *= s;
      }
    }

    function draw() {
      const el = ref.current;
      const ctx = el?.getContext("2d", { alpha: true });
      if (!el || !ctx) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dark = modeRef.current === "dark";
      const strokeBrick = dark ? "rgba(255, 248, 200, 0.45)" : "rgba(120, 90, 0, 0.35)";

      ctx.clearRect(0, 0, w, h);

      for (const b of bricks) {
        if (!b.alive) continue;
        ctx.fillStyle = `rgb(${BRICK.r},${BRICK.g},${BRICK.b})`;
        ctx.strokeStyle = strokeBrick;
        ctx.lineWidth = dark ? 1 : 1.25;
        const r = 3;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, r);
        ctx.fill();
        ctx.stroke();
        if (dark) {
          ctx.fillStyle = "rgba(255,255,255,0.14)";
          const hw = Math.min(4, b.w * 0.35);
          ctx.fillRect(b.x + 2, b.y + 2, hw, b.h - 4);
        }
      }

      const pL = paddle.x - paddle.w / 2;
      const pT = paddle.y - paddle.h / 2;
      ctx.fillStyle = `rgb(${ACCENT_GOLD.r},${ACCENT_GOLD.g},${ACCENT_GOLD.b})`;
      ctx.beginPath();
      ctx.roundRect(pL, pT, paddle.w, paddle.h, 5);
      ctx.fill();
      ctx.strokeStyle = dark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = `rgb(${ACCENT_GOLD.r},${ACCENT_GOLD.g},${ACCENT_GOLD.b})`;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.12)";
      ctx.stroke();
    }

    function frame(now: number) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dt = Math.min(48, Math.max(4, now - lastT));
      lastT = now;
      if (animate) {
        step(dt, w, h);
      }
      draw();
      raf.current = requestAnimationFrame(frame);
    }

    raf.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf.current);
      celebrationUntil = 0;
      setWinBanner(false);
    };
  }, [visible, animate]);

  if (!visible) return null;

  return (
    <>
      <canvas
        ref={ref}
        className="pointer-events-none fixed inset-0 z-0 h-full w-full min-h-0 min-w-0"
        aria-hidden
      />
      {winBanner ? (
        <div
          className="pointer-events-none fixed inset-0 z-[1] flex min-h-0 min-w-0 flex-col items-center justify-center px-6"
          aria-hidden
        >
          <p
            className="text-center font-sans text-5xl font-bold tracking-tight text-[var(--modulr-accent)] drop-shadow-[0_2px_24px_rgba(255,183,0,0.35)] sm:text-6xl md:text-7xl"
            style={{ textShadow: "0 0 40px rgba(255, 183, 0, 0.25)" }}
          >
            You won!
          </p>
          <p className="modulr-text-muted mt-4 text-center text-sm font-medium sm:text-base">
            New game in a moment…
          </p>
        </div>
      ) : null}
    </>
  );
}

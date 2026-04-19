"use client";

import { useEffect, useRef, useState } from "react";

import "./BrickField.css";

const POINTS_PER_BRICK = 10

/** Bricks broken since last paddle hit; tiers are inclusive at the brick that earns that mult. */
function rallyScoreMultiplier(bricksInRallySoFar: number): number {
  if (bricksInRallySoFar < 3) return 1
  if (bricksInRallySoFar < 5) return 2
  if (bricksInRallySoFar < 11) return 3
  return 5
}

/** Horizontal gap between brick columns — keep in sync with ``buildBricks``. */
const BRICK_GAP = 6

/** Consecutive returns to the paddle with zero bricks broken (1st → −10 … 5+ → −50 + shift). */
function emptyRallyPenaltyPoints(consecutiveEmpty: number): number {
  if (consecutiveEmpty <= 1) return 10
  if (consecutiveEmpty === 2) return 20
  if (consecutiveEmpty === 3) return 30
  if (consecutiveEmpty === 4) return 40
  return 50
}

const PADDLE_MARGIN_LEFT = 44
const PADDLE_THICK = 11
const PADDLE_LEN_MIN = 96
const PADDLE_LEN_MAX = 168
const BALL_R = 7
const BALL_SPEED_MIN = 280
const BALL_SPEED_MAX = 400
const PADDLE_LERP = 0.13
const PADDLE_MAX_SPEED = 480
const TRACK_AFTER_X_FR = 0.2
const FAIL_X = 10
const WIN_CELEBRATION_MS = 2800
const LOSE_PAUSE_MS = 2800

type Brick = {
  x: number
  y: number
  w: number
  h: number
  alive: boolean
  hueShift: number
}

type BrickPalette = { h: number; s: number; lMid: number }

/** Use the saturated brick palette in both UI light and dark modes (bright, happy colors). */
const BRICKS_SATURATED = true;

function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const l01 = clamp(l, 0, 1)
  const s01 = clamp(s, 0, 1)
  const hh = ((h % 360) + 360) % 360
  const a = s01 * Math.min(l01, 1 - l01)
  const f = (n: number) => {
    const k = (n + hh / 30) % 12
    return l01 - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1))
  }
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  }
}

function isTooMuted(r: number, g: number, b: number): boolean {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  if (mx < 34 || mn > 245) return true
  if (mx - mn < 20) return true
  return false
}

function pickBrickPalette(): BrickPalette {
  for (let i = 0; i < 28; i++) {
    const h = Math.random() * 360
    const s = 0.55 + Math.random() * 0.38
    const lMid = 0.3 + Math.random() * 0.24
    const dark = hslToRgb(h, s, clamp(lMid + 0.12, 0, 1))
    const light = hslToRgb(h, s, clamp(lMid - 0.1, 0, 1))
    if (!isTooMuted(dark.r, dark.g, dark.b) && !isTooMuted(light.r, light.g, light.b)) {
      return { h, s, lMid }
    }
  }
  return { h: 28 + Math.random() * 200, s: 0.7, lMid: 0.38 }
}

function brickFillRgb(
  palette: BrickPalette,
  dark: boolean,
  hueShift: number,
): { r: number; g: number; b: number } {
  const h = (palette.h + hueShift + 360) % 360
  const L = dark
    ? clamp(palette.lMid + 0.12, 0.4, 0.68)
    : clamp(palette.lMid - 0.11, 0.22, 0.52)
  return hslToRgb(h, palette.s, L)
}

function rgbLuminance(rgb: { r: number; g: number; b: number }): number {
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
}

function strokeStyleForFill(
  rgb: { r: number; g: number; b: number },
  dark: boolean,
): string {
  const lum = rgbLuminance(rgb)
  return dark
    ? `rgba(255,255,255,${clamp(0.22 + lum * 0.35, 0.2, 0.55)})`
    : `rgba(0,0,0,${clamp(0.18 + (1 - lum) * 0.25, 0.15, 0.42)})`
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function len(x: number, y: number) {
  return Math.hypot(x, y)
}

function randomBallVelocity(): { vx: number; vy: number } {
  const sp = BALL_SPEED_MIN + Math.random() * (BALL_SPEED_MAX - BALL_SPEED_MIN)
  const spread = (Math.random() - 0.5) * (Math.PI * 0.34)
  return { vx: Math.cos(spread) * sp, vy: Math.sin(spread) * sp }
}

/** Brick width from row height — keep in sync with resize scaling. */
function brickWidthForRowHeight(bh: number): number {
  return clamp(bh / 2.35, 20, 52)
}

function buildBricks(w: number, h: number): Brick[] {
  const marginR = w * 0.05
  const marginTop = h * 0.055
  const marginBottom = h * 0.03
  const gap = BRICK_GAP
  const availH = h - marginTop - marginBottom
  const minRowH = 38
  const rows = clamp(Math.floor((availH + gap) / (minRowH + gap)), 8, 28)
  const bh = (availH - gap * (rows - 1)) / rows
  const bw = brickWidthForRowHeight(bh)
  const cols = clamp(Math.floor((w * 0.44) / (bw + gap)), 4, 12)
  const bricks: Brick[] = []
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (Math.random() > 0.78) continue
      const x = w - marginR - bw - c * (bw + gap)
      const y = marginTop + r * (bh + gap)
      bricks.push({
        x,
        y,
        w: bw,
        h: bh,
        alive: true,
        hueShift: (Math.random() - 0.5) * 26,
      })
    }
  }
  if (bricks.length < 8) {
    return buildBricks(w, h)
  }
  return bricks
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
  const cx = clamp(bx, rx, rx + rw)
  const cy = clamp(by, ry, ry + rh)
  let dx = bx - cx
  let dy = by - cy
  const d2 = dx * dx + dy * dy
  if (d2 >= br * br) return null
  const d = Math.sqrt(d2)
  if (d < 1e-4) {
    const penL = bx - rx
    const penR = rx + rw - bx
    const penT = by - ry
    const penB = ry + rh - by
    const m = Math.min(penL, penR, penT, penB)
    if (m === penT) return { nx: 0, ny: -1, pen: br + m }
    if (m === penB) return { nx: 0, ny: 1, pen: br + m }
    if (m === penL) return { nx: -1, ny: 0, pen: br + m }
    return { nx: 1, ny: 0, pen: br + m }
  }
  dx /= d
  dy /= d
  return { nx: dx, ny: dy, pen: br - d }
}

type Props = {
  /** Mount canvas and loop only when this backdrop mode is active. */
  visible: boolean;
  /** Parent may pass false to freeze simulation (e.g. reduced motion handled inside too). */
  animate?: boolean;
};

/**
 * Canvas breakout wall backdrop (single rAF, capped DPR). Full-viewport layer behind the shell.
 * Brick colors stay saturated in both UI light and dark modes.
 */
export function BrickField({ visible, animate = true }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const simulateRef = useRef(false);
  const [score, setScore] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [hudRgb, setHudRgb] = useState({ r: 120, g: 200, b: 255 });
  const [activeScoreMultiplier, setActiveScoreMultiplier] = useState(1);
  const displayScoreAnimRef = useRef(0);
  const scoreAnimRafRef = useRef(0);
  /** Set when a score deduction crosses from ≥0 into negative (empty rallies, future shop costs, etc.). */
  const brickShiftForDebtRef = useRef(false);
  const scoreAddRef = useRef<(n: number) => void>(() => {});
  const hudPaletteRef = useRef<(p: BrickPalette) => void>(() => {});
  const syncActiveMultRef = useRef<(m: number) => void>(() => {});
  scoreAddRef.current = (n: number) =>
    setScore((s) => {
      const next = s + n;
      if (n < 0 && s >= 0 && next < 0) {
        brickShiftForDebtRef.current = true;
      }
      return next;
    });
  hudPaletteRef.current = (p: BrickPalette) => {
    const rgb = brickFillRgb(p, BRICKS_SATURATED, 6);
    setHudRgb(rgb);
  };
  syncActiveMultRef.current = (m: number) => {
    setActiveScoreMultiplier((prev) => (prev === m ? prev : m));
  };
  /** Backdrop-only: zero score each new level; a future “real” mode can skip this for carryover. */
  const resetScoreForNewLevelRef = useRef<() => void>(() => {});
  resetScoreForNewLevelRef.current = () => {
    cancelAnimationFrame(scoreAnimRafRef.current);
    scoreAnimRafRef.current = 0;
    displayScoreAnimRef.current = 0;
    setScore(0);
    setDisplayScore(0);
    setActiveScoreMultiplier(1);
  };
  const [winOverlay, setWinOverlay] = useState<{
    open: boolean;
    rgb: { r: number; g: number; b: number };
  }>({ open: false, rgb: { r: 255, g: 183, b: 0 } });
  const [loseOverlay, setLoseOverlay] = useState<{
    open: boolean;
    rgb: { r: number; g: number; b: number };
    reason: "miss" | "brick";
  }>({ open: false, rgb: { r: 255, g: 183, b: 0 }, reason: "miss" });
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === "undefined" || !document.hidden,
  );
  const [reduceMotion, setReduceMotion] = useState(() => {
    try {
      return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")
        .matches;
    } catch {
      return false;
    }
  });

  simulateRef.current = animate && tabVisible && !reduceMotion;

  useEffect(() => {
    if (!visible) {
      cancelAnimationFrame(scoreAnimRafRef.current)
      scoreAnimRafRef.current = 0
      setScore(0)
      setDisplayScore(0)
      displayScoreAnimRef.current = 0
      setActiveScoreMultiplier(1)
      setLoseOverlay((s) => ({ ...s, open: false }))
      brickShiftForDebtRef.current = false
    }
  }, [visible])

  useEffect(() => {
    if (reduceMotion) {
      if (scoreAnimRafRef.current) {
        cancelAnimationFrame(scoreAnimRafRef.current)
        scoreAnimRafRef.current = 0
      }
      displayScoreAnimRef.current = score
      setDisplayScore(score)
      return
    }
    cancelAnimationFrame(scoreAnimRafRef.current)
    const from = displayScoreAnimRef.current
    const to = score
    if (from === to) return
    const start = performance.now()
    const span = to - from
    const duration = clamp(220 + Math.min(480, Math.abs(span) * 3), 200, 900)

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      const v = Math.round(from + span * eased)
      displayScoreAnimRef.current = v
      setDisplayScore(v)
      if (t < 1) {
        scoreAnimRafRef.current = requestAnimationFrame(tick)
      } else {
        scoreAnimRafRef.current = 0
        displayScoreAnimRef.current = to
        setDisplayScore(to)
      }
    }
    scoreAnimRafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(scoreAnimRafRef.current)
      scoreAnimRafRef.current = 0
    }
  }, [score, reduceMotion, visible])

  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    try {
      const mq = globalThis.matchMedia('(prefers-reduced-motion: reduce)')
      const fn = () => setReduceMotion(mq.matches)
      mq.addEventListener('change', fn)
      return () => mq.removeEventListener('change', fn)
    } catch {
      return undefined
    }
  }, [])

  useEffect(() => {
    if (!visible) {
      if (raf.current) cancelAnimationFrame(raf.current)
      setWinOverlay((s) => ({ ...s, open: false }))
      setLoseOverlay((s) => ({ ...s, open: false }))
      return
    }

    const root = hostRef.current
    const cnv = canvasRef.current
    if (!root || !cnv) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const ball = { x: 0, y: 0, vx: 0, vy: 0, r: BALL_R };
    const paddle = { x: 0, y: 0, w: PADDLE_THICK, h: PADDLE_LEN_MIN }
    let bricks: Brick[] = []
    let brickPalette: BrickPalette = { h: 45, s: 0.72, lMid: 0.38 }
    let gameW = 0
    let gameH = 0
    let aimJitter = 0
    let aimJitterTarget = 0
    let jitterAccum = 0
    let paddleEngaged = false
    let celebrationUntil = 0
    let lossUntil = 0
    let bricksSincePaddle = 0
    let consecutiveEmptyRallies = 0

    function paddleLenFor(h: number) {
      return clamp(h * 0.15, PADDLE_LEN_MIN, PADDLE_LEN_MAX)
    }

    function resetBall(_w: number, h: number) {
      paddle.h = paddleLenFor(h)
      paddle.x = PADDLE_MARGIN_LEFT + paddle.w / 2
      paddle.y = h / 2 + (Math.random() - 0.5) * h * 0.12
      paddle.y = clamp(paddle.y, paddle.h / 2 + 10, h - paddle.h / 2 - 10)
      aimJitter = 0
      aimJitterTarget = (Math.random() * 2 - 1) * paddle.h * 0.2
      jitterAccum = 0
      paddleEngaged = false

      const v = randomBallVelocity()
      ball.x = paddle.x + paddle.w / 2 + ball.r + 5
      ball.y = paddle.y
      ball.vx = Math.abs(v.vx)
      ball.vy = v.vy
      ball.r = BALL_R
      bricksSincePaddle = 0
      syncActiveMultRef.current(1)
    }

    function newLevel(w: number, h: number) {
      resetScoreForNewLevelRef.current()
      brickShiftForDebtRef.current = false
      consecutiveEmptyRallies = 0
      lossUntil = 0
      brickPalette = pickBrickPalette()
      hudPaletteRef.current(brickPalette)
      bricks = buildBricks(w, h)
      resetBall(w, h)
      gameW = w
      gameH = h
    }

    function shiftBricksTowardPaddle() {
      const sample = bricks.find((b) => b.alive)
      if (!sample) return
      const dx = sample.w + BRICK_GAP
      for (const b of bricks) {
        b.x -= dx
      }
    }

    /** Any alive brick whose horizontal span intersects the paddle column (x only).
     *
     * Full AABB overlap fails here: the paddle is a short vertical bar that follows the
     * ball, while bricks fill many rows—bricks can reach the paddle strip in x but sit
     * above/below the paddle in y, so the loss condition never fired.
     */
    function anyBrickHitsPaddle(): boolean {
      const pL = paddle.x - paddle.w / 2
      const pR = pL + paddle.w
      for (const b of bricks) {
        if (!b.alive) continue
        const bR = b.x + b.w
        if (pL < bR && pR > b.x) {
          return true
        }
      }
      return false
    }

    function triggerGameOver(reason: 'miss' | 'brick') {
      if (lossUntil > 0 || celebrationUntil > 0) return
      const t = performance.now()
      celebrationUntil = 0
      lossUntil = t + LOSE_PAUSE_MS
      setLoseOverlay({
        open: true,
        rgb: brickFillRgb(brickPalette, BRICKS_SATURATED, 6),
        reason,
      });
    }

    function scaleGameStateTo(newW: number, newH: number) {
      if (gameW <= 0 || gameH <= 0) return
      const sx = newW / gameW
      const sy = newH / gameH
      ball.x = clamp(ball.x * sx, ball.r, newW - ball.r)
      ball.y = clamp(ball.y * sy, ball.r, newH - ball.r)
      paddle.x *= sx
      paddle.y *= sy
      paddle.h = paddleLenFor(newH)
      paddle.y = clamp(paddle.y, paddle.h / 2 + 8, newH - paddle.h / 2 - 8)
      paddle.x = clamp(paddle.x, paddle.w / 2 + 4, newW - paddle.w / 2 - 4)
      // Scale brick geometry with the same factors as positions (sx on x/w, sy on y/h).
      // Deriving w only from sy-biased height made columns drift vs x * sx (Codex P2).
      for (const b of bricks) {
        b.x *= sx
        b.y *= sy
        b.w = Math.max(2, b.w * sx)
        b.h = Math.max(4, b.h * sy)
      }
      gameW = newW
      gameH = newH
    }

    function resize() {
      const hostEl = hostRef.current
      const canvasEl = canvasRef.current
      if (!hostEl || !canvasEl) return
      const w = Math.max(1, Math.floor(hostEl.clientWidth))
      const h = Math.max(1, Math.floor(hostEl.clientHeight))
      canvasEl.width = Math.floor(w * dpr)
      canvasEl.height = Math.floor(h * dpr)
      canvasEl.style.width = `${w}px`
      canvasEl.style.height = `${h}px`
      const c = canvasEl.getContext('2d', { alpha: true })
      if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (gameW === 0 || gameH === 0) {
        newLevel(w, h)
        return
      }
      if (w === gameW && h === gameH) {
        return
      }
      scaleGameStateTo(w, h)
    }

    resize()
    draw()
    let lastT = performance.now()

    let resizeRafId = 0
    const scheduleResize = () => {
      if (resizeRafId) cancelAnimationFrame(resizeRafId)
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = 0
        resize()
        lastT = performance.now()
      })
    }

    const ro = new ResizeObserver(() => scheduleResize())
    ro.observe(root)

    function reflect(nx: number, ny: number) {
      const dot = ball.vx * nx + ball.vy * ny
      ball.vx -= 2 * dot * nx
      ball.vy -= 2 * dot * ny
    }

    function step(dt: number, w: number, h: number) {
      const now = performance.now()
      if (lossUntil > 0) {
        if (now >= lossUntil) {
          lossUntil = 0
          setLoseOverlay((s) => ({ ...s, open: false }))
          newLevel(w, h)
        }
        return
      }
      if (celebrationUntil > 0) {
        if (now >= celebrationUntil) {
          celebrationUntil = 0
          setWinOverlay((s) => ({ ...s, open: false }))
          newLevel(w, h)
        }
        return
      }

      if (brickShiftForDebtRef.current) {
        brickShiftForDebtRef.current = false
        shiftBricksTowardPaddle()
        if (anyBrickHitsPaddle()) {
          triggerGameOver('brick')
          return
        }
      }

      jitterAccum += dt
      if (jitterAccum > 650 + Math.random() * 400) {
        jitterAccum = 0
        aimJitterTarget = (Math.random() * 2 - 1) * paddle.h * 0.22
      }
      aimJitter += (aimJitterTarget - aimJitter) * Math.min(1, dt * 0.003)

      const trackThreshold = w * TRACK_AFTER_X_FR
      if (ball.x >= trackThreshold) {
        paddleEngaged = true
      }
      if (paddleEngaged) {
        const targetY = ball.y + aimJitter
        const dy = targetY - paddle.y
        const stepMax = (PADDLE_MAX_SPEED * dt) / 1000
        paddle.y += clamp(dy * PADDLE_LERP, -stepMax, stepMax)
      }
      paddle.y = clamp(paddle.y, paddle.h / 2 + 8, h - paddle.h / 2 - 8)

      ball.x += (ball.vx * dt) / 1000
      ball.y += (ball.vy * dt) / 1000

      if (ball.y < ball.r) {
        ball.y = ball.r
        ball.vy = Math.abs(ball.vy)
      }
      if (ball.y > h - ball.r) {
        ball.y = h - ball.r
        ball.vy = -Math.abs(ball.vy)
      }
      if (ball.x > w - ball.r) {
        ball.x = w - ball.r
        ball.vx = -Math.abs(ball.vx)
      }

      const pL = paddle.x - paddle.w / 2
      const pT = paddle.y - paddle.h / 2
      const hitPad = circleAABBCollision(
        ball.x,
        ball.y,
        ball.r,
        pL,
        pT,
        paddle.w,
        paddle.h,
      )
      if (hitPad && ball.vx < 0) {
        const hadBrick = bricksSincePaddle > 0
        if (!hadBrick) {
          consecutiveEmptyRallies += 1
          const pen = emptyRallyPenaltyPoints(consecutiveEmptyRallies)
          scoreAddRef.current(-pen)
          if (consecutiveEmptyRallies >= 5) {
            shiftBricksTowardPaddle()
          }
        } else {
          consecutiveEmptyRallies = 0
        }

        if (anyBrickHitsPaddle()) {
          triggerGameOver('brick')
          return
        }

        ball.x -= hitPad.nx * hitPad.pen
        ball.y -= hitPad.ny * hitPad.pen
        const u = clamp((ball.y - paddle.y) / (paddle.h * 0.5), -1, 1)
        let speed = len(ball.vx, ball.vy)
        speed = clamp(speed, BALL_SPEED_MIN, BALL_SPEED_MAX)
        const theta = u * (Math.PI * 0.4)
        ball.vx = Math.cos(theta) * speed
        ball.vy = Math.sin(theta) * speed
        if (ball.vx < 140) ball.vx = 140
        bricksSincePaddle = 0
        syncActiveMultRef.current(1)
      }

      for (const b of bricks) {
        if (!b.alive) continue
        const hit = circleAABBCollision(
          ball.x,
          ball.y,
          ball.r,
          b.x,
          b.y,
          b.w,
          b.h,
        )
        if (hit) {
          b.alive = false
          bricksSincePaddle += 1
          const mult = rallyScoreMultiplier(bricksSincePaddle)
          syncActiveMultRef.current(mult)
          scoreAddRef.current(POINTS_PER_BRICK * mult)
          ball.x -= hit.nx * hit.pen
          ball.y -= hit.ny * hit.pen
          reflect(hit.nx, hit.ny)
          break
        }
      }

      if (!bricks.some((b) => b.alive)) {
        celebrationUntil = now + WIN_CELEBRATION_MS
        setWinOverlay({
          open: true,
          rgb: brickFillRgb(brickPalette, BRICKS_SATURATED, 6),
        });
        return;
      }

      if (ball.x - ball.r < FAIL_X) {
        triggerGameOver('miss')
        return
      }

      if (anyBrickHitsPaddle()) {
        triggerGameOver('brick')
        return
      }

      const sp = len(ball.vx, ball.vy)
      if (sp < BALL_SPEED_MIN) {
        const s = BALL_SPEED_MIN / sp
        ball.vx *= s
        ball.vy *= s
      }
      if (sp > BALL_SPEED_MAX * 1.15) {
        const s = (BALL_SPEED_MAX * 1.15) / sp
        ball.vx *= s
        ball.vy *= s
      }
    }

    function draw() {
      const hostEl = hostRef.current
      const canvasEl = canvasRef.current
      if (!hostEl || !canvasEl) return
      const ctx = canvasEl.getContext('2d', { alpha: true })
      if (!ctx) return
      const w = Math.max(1, Math.floor(hostEl.clientWidth))
      const h = Math.max(1, Math.floor(hostEl.clientHeight))

      ctx.clearRect(0, 0, w, h);

      const sat = BRICKS_SATURATED;
      for (const b of bricks) {
        if (!b.alive) continue;
        const rgb = brickFillRgb(brickPalette, sat, b.hueShift);
        ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
        ctx.strokeStyle = strokeStyleForFill(rgb, sat);
        ctx.lineWidth = sat ? 1 : 1.25;
        const r = 3;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, r);
        ctx.fill();
        ctx.stroke();
        if (sat) {
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          const hw = Math.min(4, b.w * 0.35);
          ctx.fillRect(b.x + 2, b.y + 2, hw, b.h - 4);
        }
      }

      const pL = paddle.x - paddle.w / 2;
      const pT = paddle.y - paddle.h / 2;
      const paddleRgb = brickFillRgb(brickPalette, sat, 0);
      const ballRgb = brickFillRgb(brickPalette, sat, 6);
      ctx.fillStyle = `rgb(${paddleRgb.r},${paddleRgb.g},${paddleRgb.b})`;
      ctx.beginPath();
      ctx.roundRect(pL, pT, paddle.w, paddle.h, 5);
      ctx.fill();
      ctx.strokeStyle = strokeStyleForFill(paddleRgb, sat);
      ctx.lineWidth = sat ? 1 : 1.25;
      ctx.stroke();
      if (sat) {
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        const hw = Math.min(4, paddle.w * 2.2);
        ctx.fillRect(pL + 1, pT + 3, hw, paddle.h - 6);
      }

      ctx.fillStyle = `rgb(${ballRgb.r},${ballRgb.g},${ballRgb.b})`;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = strokeStyleForFill(ballRgb, sat);
      ctx.lineWidth = sat ? 1 : 1.25;
      ctx.stroke();
    }

    let idleDrawAccum = 0

    function frame(now: number) {
      const hostEl = hostRef.current
      if (!hostEl) return
      const w = Math.max(1, Math.floor(hostEl.clientWidth))
      const h = Math.max(1, Math.floor(hostEl.clientHeight))
      const dt = Math.min(48, Math.max(4, now - lastT))
      lastT = now
      const sim = simulateRef.current
      const celebrating = celebrationUntil > 0
      const losing = lossUntil > 0
      if (sim || celebrating || losing) {
        idleDrawAccum = 0
        step(dt, w, h)
        draw()
      } else {
        idleDrawAccum += dt
        if (idleDrawAccum >= 640) {
          idleDrawAccum = 0
          draw()
        }
      }
      raf.current = requestAnimationFrame(frame)
    }

    raf.current = requestAnimationFrame(frame)

    return () => {
      ro.disconnect()
      if (resizeRafId) cancelAnimationFrame(resizeRafId)
      cancelAnimationFrame(raf.current)
      celebrationUntil = 0
      setWinOverlay((s) => ({ ...s, open: false }))
      setLoseOverlay((s) => ({ ...s, open: false }))
    }
  }, [visible])

  if (!visible) return null

  const hudStroke = strokeStyleForFill(hudRgb, BRICKS_SATURATED);
  const hudGlow = `0 0 28px rgba(${hudRgb.r},${hudRgb.g},${hudRgb.b},0.35), 0 0 14px rgba(${hudRgb.r},${hudRgb.g},${hudRgb.b},0.22)`
  const multGlow = `0 0 20px rgba(${hudRgb.r},${hudRgb.g},${hudRgb.b},0.32), 0 0 10px rgba(${hudRgb.r},${hudRgb.g},${hudRgb.b},0.2)`

  return (
    <div ref={hostRef} className="modulr-brick-field">
      <canvas ref={canvasRef} className="modulr-brick-field__canvas" aria-hidden />
      <div className="modulr-brick-field__hud" aria-hidden>
        <div
          className="modulr-brick-field__score"
          style={{
            color: `rgb(${hudRgb.r},${hudRgb.g},${hudRgb.b})`,
            textShadow: reduceMotion ? undefined : hudGlow,
          }}
        >
          <span className="modulr-brick-field__score-value">
            {displayScore.toLocaleString()}
          </span>
        </div>
        {activeScoreMultiplier > 1 ? (
          <div
            key={activeScoreMultiplier}
            className={`modulr-brick-field__mult${reduceMotion ? '' : ' modulr-brick-field__mult--pulse'}`}
            style={{
              color: `rgb(${hudRgb.r},${hudRgb.g},${hudRgb.b})`,
              textShadow: reduceMotion ? undefined : multGlow,
            }}
          >
            <span className="modulr-brick-field__mult-value">{activeScoreMultiplier}×</span>
            <span className="modulr-brick-field__mult-label" style={{ color: hudStroke }}>
              mult
            </span>
          </div>
        ) : null}
        <span className="modulr-brick-field__score-label" style={{ color: hudStroke }}>
          pts
        </span>
      </div>
      {winOverlay.open ? (
        <div className="modulr-brick-field__win" aria-hidden>
          <p
            className="modulr-brick-field__win-title"
            style={{
              color: `rgb(${winOverlay.rgb.r},${winOverlay.rgb.g},${winOverlay.rgb.b})`,
              textShadow: `0 0 40px rgba(${winOverlay.rgb.r},${winOverlay.rgb.g},${winOverlay.rgb.b},0.28), 0 2px 24px rgba(${winOverlay.rgb.r},${winOverlay.rgb.g},${winOverlay.rgb.b},0.38)`,
            }}
          >
            You won!
          </p>
          <p className="modulr-brick-field__win-sub">New game in a moment…</p>
        </div>
      ) : null}
      {loseOverlay.open ? (
        <div className="modulr-brick-field__win modulr-brick-field__lose" aria-hidden>
          <p
            className="modulr-brick-field__win-title"
            style={{
              color: `rgb(${loseOverlay.rgb.r},${loseOverlay.rgb.g},${loseOverlay.rgb.b})`,
              textShadow: `0 0 40px rgba(${loseOverlay.rgb.r},${loseOverlay.rgb.g},${loseOverlay.rgb.b},0.28), 0 2px 24px rgba(${loseOverlay.rgb.r},${loseOverlay.rgb.g},${loseOverlay.rgb.b},0.38)`,
            }}
          >
            Game over
          </p>
          <p className="modulr-brick-field__win-sub">
            {loseOverlay.reason === 'miss'
              ? 'The ball slipped past your paddle.'
              : 'Bricks reached your paddle.'}{' '}
            <span className="modulr-brick-field__lose-hint">New game in a moment…</span>
          </p>
        </div>
      ) : null}
    </div>
  )
}

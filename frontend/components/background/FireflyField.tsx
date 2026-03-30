"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  tw: number;
};

const COUNT = 48;
const ACCENT = { r: 255, g: 183, b: 0 };
/** Same family as light-mode page contrast / dark shell background */
const DARK_BG = { r: 16, g: 19, b: 26 }; /* #10131A */
const DARK_BG_2 = { r: 22, g: 27, b: 38 }; /* #161b26 */

type ColorMode = "dark" | "light";

export function FireflyField({
  active,
  colorMode,
}: {
  active: boolean;
  colorMode: ColorMode;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef<number>(0);
  const particles = useRef<Particle[] | null>(null);
  const modeRef = useRef(colorMode);
  modeRef.current = colorMode;

  useEffect(() => {
    if (!active) {
      if (raf.current) cancelAnimationFrame(raf.current);
      return;
    }

    const cnv = ref.current;
    if (!cnv) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const el = ref.current;
      if (!el) return;
      const c = el.getContext("2d", { alpha: true });
      if (!c) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      el.width = Math.floor(w * dpr);
      el.height = Math.floor(h * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed(w: number, h: number): Particle[] {
      return Array.from({ length: COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1.2 + Math.random() * 2.2,
        phase: Math.random() * Math.PI * 2,
        tw: 0.4 + Math.random() * 0.9,
      }));
    }

    let last = performance.now();
    resize();
    particles.current = seed(cnv.width / dpr, cnv.height / dpr);

    const onResize = () => {
      resize();
      const w = window.innerWidth;
      const h = window.innerHeight;
      particles.current = seed(w, h);
    };
    window.addEventListener("resize", onResize);

    function tick(now: number) {
      const canvasEl = ref.current;
      const c = canvasEl?.getContext("2d", { alpha: true });
      if (!canvasEl || !c) return;

      const light = modeRef.current === "light";

      const dt = Math.min(32, now - last);
      last = now;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const ps = particles.current;
      if (!ps) return;

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      /**
       * Dark mode: gold glow (source-over).
       * Light mode: **dark** specks using brand background hues so they read on a light canvas
       * (additive “lighter” only works for light-on-dark, not charcoal-on-white).
       */
      c.globalCompositeOperation = "source-over";

      for (const p of ps) {
        p.phase += dt * 0.001 * p.tw;
        const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p.phase));
        p.x += p.vx * dt * 0.06;
        p.y += p.vy * dt * 0.06;
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;

        /* Slightly larger + brighter cores so glow survives backdrop-blur on glass cards */
        const radiusMul = light ? 7.5 : 9;
        const g = c.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          p.r * radiusMul,
        );

        if (light) {
          const a = pulse;
          const { r: dr, g: dg, b: db } = DARK_BG;
          const { r: d2r, g: d2g, b: d2b } = DARK_BG_2;
          g.addColorStop(0, `rgba(${dr},${dg},${db},${0.34 * a})`);
          g.addColorStop(0.18, `rgba(${d2r},${d2g},${d2b},${0.2 * a})`);
          g.addColorStop(0.45, `rgba(${dr},${dg},${db},${0.08 * a})`);
          g.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
        } else {
          g.addColorStop(
            0,
            `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${0.75 * pulse})`,
          );
          g.addColorStop(
            0.22,
            `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${0.2 * pulse})`,
          );
          g.addColorStop(0.55, `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${0.06 * pulse})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
        }

        c.fillStyle = g;
        c.beginPath();
        c.arc(p.x, p.y, p.r * radiusMul, 0, Math.PI * 2);
        c.fill();
      }

      c.globalCompositeOperation = "source-over";
      raf.current = requestAnimationFrame(tick);
    }

    raf.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf.current);
    };
  }, [active, colorMode]);

  if (!active) return null;

  return (
    <canvas
      ref={ref}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      aria-hidden
    />
  );
}

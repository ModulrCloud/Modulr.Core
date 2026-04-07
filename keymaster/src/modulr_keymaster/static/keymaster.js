/**
 * Theme toggle (Core shell tokens) + fireflies canvas (parity with `FireflyField.tsx`)
 * + pubkey copy helper.
 */
(function () {
  const STORAGE_KEY = "modulr.keymaster.theme";
  const root = document.documentElement;

  function getStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function setStored(mode) {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

  function apply(mode) {
    root.setAttribute("data-theme", mode);
    setStored(mode);
    const btn = document.getElementById("km-theme-toggle");
    if (btn) {
      btn.setAttribute(
        "aria-label",
        mode === "dark" ? "Switch to light theme" : "Switch to dark theme",
      );
      btn.setAttribute("data-mode", mode);
    }
  }

  function initTheme() {
    const stored = getStored();
    const prefersDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial =
      stored === "light" || stored === "dark" ? stored : prefersDark ? "dark" : "dark";
    apply(initial);
  }

  function toggleTheme() {
    const cur = root.getAttribute("data-theme") || "dark";
    apply(cur === "dark" ? "light" : "dark");
  }

  /**
   * Port of `frontend/components/background/FireflyField.tsx` (COUNT, motion, gradients).
   * Skipped when `prefers-reduced-motion: reduce`.
   */
  function initFireflies() {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canvas = document.getElementById("km-fireflies");
    if (!canvas || motionQuery.matches) return;

    const COUNT = 48;
    const ACCENT = { r: 255, g: 183, b: 0 };
    const DARK_BG = { r: 16, g: 19, b: 26 };
    const DARK_BG_2 = { r: 22, g: 27, b: 38 };

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    /** @type {{ x: number; y: number; vx: number; vy: number; r: number; phase: number; tw: number }[]} */
    let particles = [];
    let raf = 0;
    let last = performance.now();

    function lightMode() {
      return document.documentElement.getAttribute("data-theme") === "light";
    }

    function seed(w, h) {
      particles = Array.from({ length: COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1.2 + Math.random() * 2.2,
        phase: Math.random() * Math.PI * 2,
        tw: 0.4 + Math.random() * 0.9,
      }));
    }

    function resize() {
      const c = canvas.getContext("2d", { alpha: true });
      if (!c) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed(w, h);
    }

    function onResize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      resize();
    }

    resize();
    window.addEventListener("resize", onResize);

    function tick(now) {
      const c = canvas.getContext("2d", { alpha: true });
      if (!c) return;

      const light = lightMode();
      const dt = Math.min(32, now - last);
      last = now;
      const w = window.innerWidth;
      const h = window.innerHeight;

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      c.globalCompositeOperation = "source-over";

      for (const p of particles) {
        p.phase += dt * 0.001 * p.tw;
        const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p.phase));
        p.x += p.vx * dt * 0.06;
        p.y += p.vy * dt * 0.06;
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;

        const radiusMul = light ? 7.5 : 9;
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * radiusMul);

        if (light) {
          const a = pulse;
          const { r: dr, g: dg, b: db } = DARK_BG;
          const { r: d2r, g: d2g, b: d2b } = DARK_BG_2;
          g.addColorStop(0, `rgba(${dr},${dg},${db},${0.34 * a})`);
          g.addColorStop(0.18, `rgba(${d2r},${d2g},${d2b},${0.2 * a})`);
          g.addColorStop(0.45, `rgba(${dr},${dg},${db},${0.08 * a})`);
          g.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
        } else {
          g.addColorStop(0, `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${0.75 * pulse})`);
          g.addColorStop(0.22, `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${0.2 * pulse})`);
          g.addColorStop(0.55, `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${0.06 * pulse})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
        }

        c.fillStyle = g;
        c.beginPath();
        c.arc(p.x, p.y, p.r * radiusMul, 0, Math.PI * 2);
        c.fill();
      }

      c.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);

    function onMotionChange() {
      if (motionQuery.matches) {
        cancelAnimationFrame(raf);
        raf = 0;
        const c = canvas.getContext("2d", { alpha: true });
        if (c) {
          const w = window.innerWidth;
          const h = window.innerHeight;
          c.setTransform(dpr, 0, 0, dpr, 0, 0);
          c.clearRect(0, 0, w, h);
        }
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    }

    if (motionQuery.addEventListener) {
      motionQuery.addEventListener("change", onMotionChange);
    } else {
      motionQuery.addListener(onMotionChange);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initFireflies();
    const btn = document.getElementById("km-theme-toggle");
    if (btn) btn.addEventListener("click", toggleTheme);
  });

  window.kmCopyPubkey = function (id) {
    const el = document.getElementById(id);
    if (!el || !navigator.clipboard) return;
    const text = el.textContent.replace(/\s+/g, "").trim();
    navigator.clipboard.writeText(text).then(function () {
      const hint = document.getElementById("km-copy-hint");
      if (hint) {
        hint.hidden = false;
        window.setTimeout(function () {
          hint.hidden = true;
        }, 2000);
      }
    });
  };
})();

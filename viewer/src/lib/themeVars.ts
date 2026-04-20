/** Apply light/dark tokens to CSS custom properties. */

const ACCENT = "#ffb700";
/** Legible on Modulr gold buttons and chips in both themes */
const ACCENT_CONTRAST = "#111218";

/** Dark base from brand (#10131A); slightly lifted secondary for gradients. */
const DARK_PAGE = "#10131A";
const DARK_PAGE_2 = "#161b26";

/**
 * Apply **dark** (default) or **light** theme to `:root`.
 */
export function applyColorModeToDocument(colorMode: "dark" | "light"): void {
  const dark = colorMode === "dark";
  const root = document.documentElement;

  const pageBg = dark ? DARK_PAGE : "#e8eaf2";
  const pageBg2 = dark ? DARK_PAGE_2 : "#dce0ee";
  const text = dark ? "#e9eaef" : "#111218";
  const muted = dark ? "#9aa0b0" : "#5c6170";
  /* Header / chrome — readable bar */
  const glassFill = dark
    ? "rgba(22, 25, 36, 0.22)"
    : "rgba(255, 255, 255, 0.28)";
  /**
   * Content cards: light mode stays translucent so backdrop blur reads as glass, not
   * flat white (see `.modulr-glass-panel` + `--modulr-glass-panel-blur`).
   */
  const glassPanelFill = dark
    ? "rgba(22, 25, 36, 0.1)"
    : "rgba(255, 255, 255, 0.2)";
  const glassPanelBlur = dark ? "26px" : "42px";
  const glassBorder = dark
    ? "rgba(255, 255, 255, 0.11)"
    : "rgba(15, 23, 42, 0.11)";
  const glassHighlight = dark
    ? "rgba(255, 255, 255, 0.06)"
    : "rgba(255, 255, 255, 0.72)";
  /**
   * Top bar + icon buttons: more translucent in light mode so backdrop blur reads
   * like glass (less “milky white slab”).
   */
  const glassChromeFill = dark
    ? "rgba(22, 25, 36, 0.26)"
    : "rgba(255, 255, 255, 0.14)";
  const glassChromeBorder = dark
    ? "rgba(255, 255, 255, 0.13)"
    : "rgba(15, 23, 42, 0.12)";
  const glassChromeBlur = dark ? "24px" : "40px";

  root.style.setProperty("--modulr-page-bg", pageBg);
  root.style.setProperty("--modulr-page-bg-2", pageBg2);
  root.style.setProperty("--modulr-text", text);
  root.style.setProperty("--modulr-text-muted", muted);
  root.style.setProperty("--modulr-accent", ACCENT);
  root.style.setProperty("--modulr-accent-contrast", ACCENT_CONTRAST);
  root.style.setProperty("--modulr-glass-fill", glassFill);
  root.style.setProperty("--modulr-glass-panel-fill", glassPanelFill);
  root.style.setProperty("--modulr-glass-panel-blur", glassPanelBlur);
  root.style.setProperty("--modulr-glass-border", glassBorder);
  root.style.setProperty("--modulr-glass-highlight", glassHighlight);
  root.style.setProperty("--modulr-glass-chrome-fill", glassChromeFill);
  root.style.setProperty("--modulr-glass-chrome-border", glassChromeBorder);
  root.style.setProperty("--modulr-glass-chrome-blur", glassChromeBlur);
  root.style.setProperty("--modulr-glass-blur", dark ? "22px" : "32px");
  root.style.setProperty("--modulr-glass-sat", dark ? "1.35" : "1.55");
  root.style.setProperty("--modulr-theme-dark", dark ? "1" : "0");
  root.style.colorScheme = dark ? "dark" : "light";

  /** Settings modal: light mode needs a brighter surface; dark keeps frosted glass. */
  root.style.setProperty(
    "--modulr-settings-scrim",
    dark ? "rgba(0, 0, 0, 0.45)" : "rgba(71, 85, 105, 0.22)",
  );
  root.style.setProperty(
    "--modulr-settings-dialog-bg",
    dark ? "rgba(22, 25, 36, 0.5)" : "rgba(255, 255, 255, 0.98)",
  );
  root.style.setProperty(
    "--modulr-settings-dialog-shadow",
    dark
      ? "0 24px 80px rgba(0, 0, 0, 0.38), inset 0 1px 0 var(--modulr-glass-highlight)"
      : "0 14px 44px rgba(15, 23, 42, 0.1), 0 2px 10px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.95)",
  );

  /**
   * Registration availability strips — use app theme (not Tailwind `dark:`, which can
   * follow OS and fight the in-app light/dark toggle).
   */
  root.style.setProperty(
    "--modulr-status-success-fg",
    dark ? "rgba(209, 250, 229, 0.98)" : "#064e3b",
  );
  root.style.setProperty(
    "--modulr-status-success-bg",
    dark ? "rgba(6, 78, 59, 0.35)" : "rgba(167, 243, 208, 0.72)",
  );
  root.style.setProperty(
    "--modulr-status-success-border",
    dark ? "rgba(52, 211, 153, 0.42)" : "rgba(4, 120, 87, 0.5)",
  );
  root.style.setProperty(
    "--modulr-status-warn-fg",
    dark ? "rgba(254, 243, 199, 0.98)" : "#78350f",
  );
  root.style.setProperty(
    "--modulr-status-warn-bg",
    dark ? "rgba(120, 53, 15, 0.32)" : "rgba(254, 243, 199, 0.85)",
  );
  root.style.setProperty(
    "--modulr-status-warn-border",
    dark ? "rgba(251, 191, 36, 0.45)" : "rgba(180, 83, 9, 0.5)",
  );
}

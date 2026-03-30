/** Apply light/dark tokens to CSS custom properties. */

const ACCENT = "#ffb700";

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
    : "rgba(255, 255, 255, 0.34)";
  /**
   * Content cards: light mode uses lower alpha + stronger blur (see globals) so the
   * background still reads through without looking like solid white slabs.
   */
  const glassPanelFill = dark
    ? "rgba(22, 25, 36, 0.1)"
    : "rgba(255, 255, 255, 0.4)";
  const glassBorder = dark
    ? "rgba(255, 255, 255, 0.11)"
    : "rgba(15, 23, 42, 0.11)";
  const glassHighlight = dark
    ? "rgba(255, 255, 255, 0.06)"
    : "rgba(255, 255, 255, 0.72)";

  root.style.setProperty("--modulr-page-bg", pageBg);
  root.style.setProperty("--modulr-page-bg-2", pageBg2);
  root.style.setProperty("--modulr-text", text);
  root.style.setProperty("--modulr-text-muted", muted);
  root.style.setProperty("--modulr-accent", ACCENT);
  root.style.setProperty("--modulr-glass-fill", glassFill);
  root.style.setProperty("--modulr-glass-panel-fill", glassPanelFill);
  root.style.setProperty("--modulr-glass-border", glassBorder);
  root.style.setProperty("--modulr-glass-highlight", glassHighlight);
  root.style.setProperty("--modulr-glass-blur", dark ? "22px" : "32px");
  root.style.setProperty("--modulr-glass-sat", dark ? "1.35" : "1.55");
  root.style.setProperty("--modulr-theme-dark", dark ? "1" : "0");
  root.style.colorScheme = dark ? "dark" : "light";
}

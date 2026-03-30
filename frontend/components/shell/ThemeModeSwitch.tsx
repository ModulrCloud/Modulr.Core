"use client";

import { IconMoon, IconSunTheme } from "@/components/icons";
import { useAppUi } from "@/components/providers/AppProviders";

const ease = { transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)" };

/** Matches the settings gear: same glass chrome, single click toggles theme. */
const headerBtnClass =
  "modulr-glass-surface flex size-11 items-center justify-center rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] text-[var(--modulr-text)] shadow-lg transition-[border-color,color,box-shadow] duration-200 hover:border-[var(--modulr-accent)]/50 hover:text-[var(--modulr-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)]";

const compactBtnClass =
  "modulr-glass-surface flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] text-[var(--modulr-text)] shadow-md transition-[border-color,color,box-shadow] duration-200 hover:border-[var(--modulr-accent)]/40 hover:text-[var(--modulr-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)]";

type Props = {
  variant?: "header" | "compact";
  className?: string;
};

export function ThemeModeSwitch({ variant = "compact", className = "" }: Props) {
  const { settings, setSettings } = useAppUi();
  const isDark = settings.colorMode === "dark";

  const toggle = () =>
    setSettings((s) => ({
      ...s,
      colorMode: s.colorMode === "dark" ? "light" : "dark",
    }));

  const header = variant === "header";
  const btnClass = `${header ? headerBtnClass : compactBtnClass} ${className}`.trim();
  const shadowStyle = header
    ? {
        boxShadow:
          "0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 var(--modulr-glass-highlight)",
        transitionDuration: "0.55s",
        ...ease,
      }
    : { ...ease };

  return (
    <button
      type="button"
      title={isDark ? "Dark mode — switch to light" : "Light mode — switch to dark"}
      aria-label={
        isDark
          ? "Dark mode on. Switch to light mode"
          : "Light mode on. Switch to dark mode"
      }
      aria-pressed={isDark}
      onClick={toggle}
      className={btnClass}
      style={shadowStyle}
    >
      {isDark ? (
        <IconMoon className={header ? "size-[22px]" : "size-5"} />
      ) : (
        <IconSunTheme className={header ? "size-[22px]" : "size-5"} />
      )}
    </button>
  );
}

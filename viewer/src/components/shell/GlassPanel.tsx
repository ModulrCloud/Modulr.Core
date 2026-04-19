import type { ReactNode } from "react";

export function GlassPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`modulr-glass-panel rounded-2xl border border-[var(--modulr-glass-border)] ${className}`}
      style={{
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 var(--modulr-glass-highlight)",
      }}
    >
      {children}
    </div>
  );
}

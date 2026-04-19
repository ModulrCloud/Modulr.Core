import { Link } from "react-router-dom";

import { GlassPanel } from "@/components/shell/GlassPanel";
import type { ShellRecommendedItem } from "@/data/shellRecommendedNext";
import { SHELL_RECOMMENDED_NEXT } from "@/data/shellRecommendedNext";

const barInteractive = [
  "block w-full rounded-xl border border-[var(--modulr-glass-border)]",
  "bg-[var(--modulr-glass-fill)]",
  "px-4 py-2.5 text-left shadow-[inset_0_1px_0_var(--modulr-glass-highlight)]",
  "transition-[border-color,box-shadow,background-color] duration-200",
  "hover:border-[var(--modulr-accent)]/40 hover:bg-[var(--modulr-accent)]/8",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)]",
  "sm:px-5 sm:py-3",
].join(" ");

function RecommendedBar({ item }: { item: ShellRecommendedItem }) {
  return (
    <Link to={item.href} className={barInteractive}>
      <p className="font-modulr-display text-[15px] font-bold leading-tight text-[var(--modulr-accent)] sm:text-base">
        {item.name}
      </p>
      <p className="modulr-text-muted mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em]">
        {item.category}
      </p>
      <p className="modulr-text-muted mt-1.5 text-[13px] leading-snug">{item.description}</p>
    </Link>
  );
}

/**
 * “Recommended next” — full-width bars (entire row is the hit target), Modulr.Code-style.
 */
export function RecommendedNextShell({
  items = SHELL_RECOMMENDED_NEXT,
}: {
  items?: ShellRecommendedItem[];
}) {
  return (
    <GlassPanel className="p-5 sm:p-6">
      <p className="font-modulr-display text-xs font-bold uppercase tracking-[0.2em] text-[var(--modulr-text)]">
        Recommended next
      </p>
      <p className="modulr-text-muted mt-2 max-w-2xl text-[13px] leading-relaxed">
        Based on what this shell offers today, these surfaces are a good first hop — you still have
        the full nav above anytime.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {items.map((item) => (
          <RecommendedBar key={item.id} item={item} />
        ))}
      </div>
    </GlassPanel>
  );
}

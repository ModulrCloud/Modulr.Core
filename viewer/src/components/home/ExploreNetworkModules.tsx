import { Link } from "react-router-dom";

import { GlassPanel } from "@/components/shell/GlassPanel";
import type { NetworkModule } from "@/data/networkModules";
import { NETWORK_MODULES } from "@/data/networkModules";

const barBase =
  "block w-full rounded-xl border text-left transition-[border-color,box-shadow,background-color] duration-200";

/** Same frosted bar for linked and coming-soon rows (light mode: avoid page-bg color-mix washing out). */
const barShell =
  "border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] shadow-[inset_0_1px_0_var(--modulr-glass-highlight)]";

function ModuleBar({ mod }: { mod: NetworkModule }) {
  const ready = mod.href != null;
  const interactive = ready
    ? `${barBase} ${barShell} hover:border-[var(--modulr-accent)]/40 hover:bg-[var(--modulr-accent)]/8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modulr-accent)]`
    : `${barBase} ${barShell} cursor-default`;

  const inner = (
    <>
      <p className="font-modulr-display text-[15px] font-bold leading-tight text-[var(--modulr-accent)] sm:text-base">
        {mod.name}
      </p>
      <p className="modulr-text-muted mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em]">
        {mod.category}
      </p>
      <p className="modulr-text-muted mt-1.5 text-[13px] leading-snug">{mod.description}</p>
      {!ready && (
        <p className="modulr-text-muted mt-2 text-xs font-medium">Coming soon</p>
      )}
    </>
  );

  const compact = "px-3 py-2 sm:px-3.5 sm:py-2.5";

  if (ready && mod.href!.startsWith("http")) {
    return (
      <a
        href={mod.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${interactive} ${compact}`}
      >
        {inner}
      </a>
    );
  }
  if (ready) {
    return (
      <Link to={mod.href!} className={`${interactive} ${compact}`}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={`${interactive} ${compact}`} aria-disabled={true}>
      {inner}
    </div>
  );
}

/**
 * Right-hand “Explore” column — network modules (compact bars, full-width tap targets).
 */
export function ExploreNetworkModules({
  modules = NETWORK_MODULES,
  className = "",
}: {
  modules?: NetworkModule[];
  className?: string;
}) {
  return (
    <GlassPanel className={`flex flex-col overflow-hidden p-1 sm:p-1.5 ${className}`}>
      <div className="shrink-0 border-b border-[var(--modulr-glass-border)] px-3 py-3 sm:px-4 sm:py-3.5">
        <p className="font-modulr-display text-[11px] font-bold uppercase tracking-[0.26em] text-[var(--modulr-accent)]">
          Explore the network
        </p>
        <p className="modulr-text-muted mt-1.5 text-[13px] leading-snug">
          Same Modulr graph — different surfaces. More modules land here over time.
        </p>
      </div>
      <div className="flex flex-col gap-2 px-2 py-2.5 sm:px-2.5 sm:py-3">
        {modules.map((mod) => (
          <ModuleBar key={mod.id} mod={mod} />
        ))}
      </div>
    </GlassPanel>
  );
}

import { GlassPanel } from "@/components/shell/GlassPanel";

export default function ModulrOsProductPage() {
  return (
    <div className="flex flex-col gap-8">
      <GlassPanel className="p-8 sm:p-10">
        <p className="font-modulr-display text-sm font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
          Product
        </p>
        <h1 className="font-modulr-display modulr-text mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Modulr.OS
        </h1>
        <p className="modulr-text-muted mt-4 max-w-2xl leading-relaxed">
          Placeholder product page for Modulr.OS — the Omni interface for Modulr across
          desktop, mobile, TV, wearables, and other capable devices, with session-aware
          layouts. A future Modulr Linux distribution builds on this story. Flesh out when
          the experience ships.
        </p>
      </GlassPanel>
    </div>
  );
}

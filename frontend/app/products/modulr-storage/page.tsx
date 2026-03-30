import { GlassPanel } from "@/components/shell/GlassPanel";

export default function ModulrStorageProductPage() {
  return (
    <div className="flex flex-col gap-8">
      <GlassPanel className="p-8 sm:p-10">
        <p className="font-modulr-display text-sm font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
          Product
        </p>
        <h1 className="font-modulr-display modulr-text mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Modulr.Storage
        </h1>
        <p className="modulr-text-muted mt-4 max-w-2xl leading-relaxed">
          Placeholder product page for Modulr.Storage — durable object and blob tiering,
          quotas, and module-scoped access. Expand with docs and pricing when available.
        </p>
      </GlassPanel>
    </div>
  );
}

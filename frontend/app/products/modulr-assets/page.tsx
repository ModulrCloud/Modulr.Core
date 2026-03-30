import { GlassPanel } from "@/components/shell/GlassPanel";

export default function ModulrAssetsProductPage() {
  return (
    <div className="flex flex-col gap-8">
      <GlassPanel className="p-8 sm:p-10">
        <p className="font-modulr-display text-sm font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
          Product
        </p>
        <h1 className="font-modulr-display modulr-text mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Modulr.Assets
        </h1>
        <p className="modulr-text-muted mt-4 max-w-2xl leading-relaxed">
          Placeholder product page for Modulr.Assets — digital asset issuance, custody
          context, and registry-aligned metadata. Replace with marketing and technical
          detail when ready.
        </p>
      </GlassPanel>
    </div>
  );
}

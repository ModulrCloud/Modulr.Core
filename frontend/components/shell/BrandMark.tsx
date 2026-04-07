"use client";

import { ModulrSymbol } from "@/components/brand/ModulrSymbol";

/**
 * Header mark: height tuned to align with the brand title + wire version + network
 * line in `AppShell` (three text rows on `sm+`).
 */
export function BrandMark() {
  return (
    <div className="min-w-0 max-w-[170px] shrink-0 origin-left">
      <ModulrSymbol pixelHeight={40} className="text-[var(--modulr-accent)]" />
    </div>
  );
}

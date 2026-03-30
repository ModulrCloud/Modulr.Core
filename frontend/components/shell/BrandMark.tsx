"use client";

import { ModulrSymbol } from "@/components/brand/ModulrSymbol";

/**
 * Header mark: explicit SVG dimensions + max width. Slight scale-up from `sm` matches
 * prior `27px` target without a second `<svg>` in the DOM.
 */
export function BrandMark() {
  return (
    <div className="min-w-0 max-w-[140px] shrink-0 origin-left scale-100 sm:scale-[1.125]">
      <ModulrSymbol pixelHeight={24} className="text-[var(--modulr-accent)]" />
    </div>
  );
}

"use client";

import { BrandMark } from "@/components/shell/BrandMark";

type Props = {
  /** SVG source from Core `GET /genesis/branding` when persisted. */
  svgMarkup: string | null | undefined;
};

/**
 * Header logo: persisted root-organization SVG when present, else default Modulr mark.
 */
export function ShellOrgLogo({ svgMarkup }: Props) {
  const s = svgMarkup?.trim();
  if (s) {
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
    return (
      <div className="flex min-h-10 min-w-0 max-w-[170px] shrink-0 items-center justify-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL from Core SVG text */}
        <img src={src} alt="" className="max-h-10 w-auto max-w-full object-contain object-left" />
      </div>
    );
  }
  return <BrandMark />;
}

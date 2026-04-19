"use client";

import type { ColorMode } from "@/lib/settings";

type Props = {
  colorMode: ColorMode;
  /** When false, gradients stay fixed (reduced motion / user preference). */
  animated: boolean;
};

/**
 * Soft layered “aurora” blobs behind glass UI. The painted layer is oversized and
 * not `overflow:hidden` so heavy blur is not clipped away (fixes “invisible aurora”).
 */
export function AuroraLayer({ colorMode, animated }: Props) {
  const tone =
    colorMode === "dark"
      ? "modulr-aurora-plate--dark"
      : "modulr-aurora-plate--light";
  const motion = animated
    ? "modulr-aurora-plate--motion"
    : "modulr-aurora-plate--static";

  return (
    <div className="modulr-aurora-host" aria-hidden>
      <div className={`modulr-aurora-plate ${tone} ${motion}`} />
    </div>
  );
}

/**
 * Inline brand mark (symbol_02). Uses explicit pixel **width** / **height** so flex
 * layout never collapses the graphic (some engines treat `w-auto` SVG as 0 wide).
 */
export function ModulrSymbol({
  className = "",
  /** Rendered height in CSS pixels; width follows 443:360 viewBox aspect ratio. */
  pixelHeight = 24,
  "aria-label": ariaLabel = "Modulr",
}: {
  className?: string;
  pixelHeight?: number;
  "aria-label"?: string;
}) {
  const pixelWidth = (pixelHeight * 443) / 360;

  return (
    <svg
      width={pixelWidth}
      height={pixelHeight}
      className={`inline-block shrink-0 ${className}`.trim()}
      viewBox="0 0 443 360"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        d="M442.907 188.374V304.017L345.935 360.002V132.411L442.907 188.374Z"
        fill="currentColor"
      />
      <path
        d="M442.907 55.9878V168.254L345.935 112.268V0.00195312L442.907 55.9878Z"
        fill="currentColor"
      />
      <path
        d="M327.923 0.00195312V112.268L230.95 168.503V56.5316L327.923 0.00195312Z"
        fill="currentColor"
      />
      <path
        d="M212.918 56.5316V168.231L115.923 111.724V0.00195312L212.918 56.5316Z"
        fill="currentColor"
      />
      <path
        d="M97.9077 0.00195312V112.268L0.958008 168.231V55.9878L97.9077 0.00195312Z"
        fill="currentColor"
      />
      <path
        d="M97.9077 132.411V360.002L0.958008 304.039V188.374L97.9077 132.411Z"
        fill="currentColor"
      />
    </svg>
  );
}

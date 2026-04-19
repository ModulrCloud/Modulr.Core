/**
 * Demonstration balances for profile preview and settings — not live ledger data.
 * Keep in sync anywhere we show MDR / MTR preview numbers.
 */
export const MOCK_MDR = 12_480;
/** Basis for preview: 1 MTR = USD 0.10 (native currency conversion is future work). */
export const MOCK_MTR = 342;
export const MTR_USD_PER_CREDIT = 0.1;

export function formatPreviewUsd(mtrCredits: number): string {
  const usd = mtrCredits * MTR_USD_PER_CREDIT;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usd);
}

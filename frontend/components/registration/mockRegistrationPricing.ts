import { hashString } from "@/components/dashboard/mockModuleMetrics";

export type RegistrationPriceQuote = {
  normalized: string;
  graphemeCount?: number;
  valid: boolean;
  total: number;
  lines: { label: string; amount: number }[];
  hint?: string;
  /** Whole-domain sales already completed in this demo (org flow). */
  orgMarketDepth?: number;
};

const usd = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMockUsd(n: number): string {
  return usd.format(n);
}

/** ICANN-style labels we never sell as Modulr org segments (traditional DNS respect). */
export const RESERVED_ORG_SEGMENTS = new Set([
  "com",
  "net",
  "org",
  "gov",
  "edu",
]);

export function countGraphemes(s: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...seg.segment(s)].length;
  }
  return [...s].length;
}

export function sanitizeNameForRegistration(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ");
  s = s.normalize("NFC");
  s = s.replace(/\p{Cc}/gu, "");
  return s.trim();
}

export function normalizeOrgKey(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/\s+/g, "");
  s = s.replace(/[^a-z0-9.-]/g, "");
  s = s.replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "");
  return s;
}

const MAX_NAME_GRAPHEMES = 32;

/** Peak scarcity; each step is ~½ of the previous (± tiny jitter). */
const NAME_TIER_ONE = 1249;
const NAME_TIER_TWO = Math.round(NAME_TIER_ONE / 2);
const NAME_TIER_THREE = Math.round(NAME_TIER_TWO / 2);

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

function nameLengthTierUsd(g: number, seed: number): { label: string; amount: number } {
  const jitter = ((seed % 19) - 9) / 100;
  if (g === 1) {
    return {
      label: "1 grapheme (peak scarcity)",
      amount: roundUsd(NAME_TIER_ONE + jitter),
    };
  }
  if (g >= 2 && g <= 3) {
    return {
      label: "2–3 graphemes (~½ of single)",
      amount: roundUsd(NAME_TIER_TWO + jitter),
    };
  }
  if (g >= 4 && g <= 5) {
    return {
      label: "4–5 graphemes (~½ of prior tier)",
      amount: roundUsd(NAME_TIER_THREE + jitter),
    };
  }
  const standard = 14.99 + (seed % 60) / 100;
  return {
    label: "6+ graphemes (standard)",
    amount: roundUsd(standard),
  };
}

export function mockNamePriceQuote(raw: string): RegistrationPriceQuote {
  const normalized = sanitizeNameForRegistration(raw);
  if (!normalized) {
    return {
      normalized: "",
      valid: false,
      total: 0,
      lines: [],
      hint: "Enter at least one character. Letters, emoji, and most Unicode are allowed (1–32 graphemes).",
    };
  }

  const graphemes = countGraphemes(normalized);
  if (graphemes > MAX_NAME_GRAPHEMES) {
    return {
      normalized,
      graphemeCount: graphemes,
      valid: false,
      total: 0,
      lines: [],
      hint: `This mock allows up to ${MAX_NAME_GRAPHEMES} graphemes (emoji usually count as one each).`,
    };
  }

  const seed = hashString(`name:${normalized}`);
  const tier = nameLengthTierUsd(graphemes, seed);
  const processing = 3.99;
  const demand = ((seed % 90) + 20) / 100;
  const total = roundUsd(tier.amount + processing + demand);

  return {
    normalized,
    graphemeCount: graphemes,
    valid: true,
    total,
    lines: [
      { label: tier.label, amount: tier.amount },
      { label: "Registration processing (mock)", amount: processing },
      { label: "Mock demand adjust.", amount: Math.round(demand * 100) / 100 },
    ],
    hint:
      "Emoji count as one grapheme when your browser supports grapheme clustering. Tiers: 1 → highest, 2–3 → ~half, 4–5 → ~half again, 6+ → normal.",
  };
}

function orgHasReservedSegment(normalized: string): string | null {
  const segments = normalized.split(".").filter(Boolean);
  for (const seg of segments) {
    if (RESERVED_ORG_SEGMENTS.has(seg)) {
      return seg;
    }
  }
  return null;
}

/** Current whole-domain anchor: first sale $100, then ×2 for each completed registration in this demo. */
export function orgNamespaceAnchorUsd(marketDepth: number): number {
  const d = Math.max(0, Math.min(marketDepth, 20));
  const raw = 100 * Math.pow(2, d);
  return Math.round(raw * 100) / 100;
}

export function mockOrgPriceQuote(
  raw: string,
  marketDepth: number,
): RegistrationPriceQuote {
  const normalized = normalizeOrgKey(raw);
  if (!normalized) {
    return {
      normalized: "",
      valid: false,
      total: 0,
      lines: [],
      hint: "Use letters, numbers, dots, and hyphens (e.g. acme or labs.acme).",
    };
  }

  const bad = orgHasReservedSegment(normalized);
  if (bad) {
    return {
      normalized,
      valid: false,
      total: 0,
      lines: [],
      hint: `Segment “${bad}” is reserved — we don’t sell .com, .net, .org, .gov, or .edu-style labels as Modulr org keys (traditional DNS stays respected).`,
    };
  }

  if (normalized.length < 2) {
    return {
      normalized,
      valid: false,
      total: 0,
      lines: [],
      hint: "Organization keys need at least 2 characters.",
    };
  }
  if (normalized.length > 64) {
    return {
      normalized,
      valid: false,
      total: 0,
      lines: [],
      hint: "Max length 64 for this mock.",
    };
  }

  const seed = hashString(`org:${normalized}`);
  const segments = normalized.split(".").filter(Boolean).length;
  const anchor = orgNamespaceAnchorUsd(marketDepth);

  /**
   * Single label = whole delegated space (any *.name in this mock story).
   * Deeper labels (bird.house) still imply a wildcard under that path; priced slightly below a fresh root.
   */
  let namespaceUsd = anchor;
  if (segments > 1) {
    namespaceUsd = anchor * (0.62 + 0.14 * (segments - 1));
  }
  namespaceUsd = Math.round(namespaceUsd * 100) / 100;

  const processing = 8.99;
  const demand = ((seed % 70) + 15) / 100;
  const total = Math.round((namespaceUsd + processing + demand) * 100) / 100;

  const segLabel =
    segments === 1
      ? "Whole namespace (single label, wildcard sub-space)"
      : `Namespace (${segments} labels, wildcard under this path)`;

  return {
    normalized,
    valid: true,
    total,
    orgMarketDepth: marketDepth,
    lines: [
      { label: `${segLabel} · anchor ${formatMockUsd(anchor)}`, amount: namespaceUsd },
      { label: "Registration processing (mock)", amount: processing },
      { label: "Mock demand adjust.", amount: Math.round(demand * 100) / 100 },
    ],
    hint:
      "Mock market: each completed org registration in this UI doubles the $100 floor for the next buyer ($100 → $200 → $400 …). Production would track real sales.",
  };
}

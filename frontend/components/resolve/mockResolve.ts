import { hashString } from "@/components/dashboard/mockModuleMetrics";

/** System registration key for the reserved Modulr namespace: bare `modulr` or `modulr.anything` (mock). */
export const MODULR_WELL_KNOWN_KEY_MOCK =
  "0x4d6f64756c72436f726500000000000000000000";

export type MockResolveResult =
  | { kind: "empty" }
  | {
      kind: "forward_name";
      label: string;
      address: string;
      inferredAt: boolean;
    }
  | {
      kind: "forward_org";
      label: string;
      address: string;
    }
  | {
      kind: "forward_modulr";
      label: string;
      address: string;
      note: string;
    }
  | {
      kind: "reverse";
      address: string;
      name: string;
      org: string | null;
    };

const ADDR_HEX = /^0x[a-fA-F0-9]{40}$/;
const ADDR_HEX64 = /^[a-fA-F0-9]{64}$/;

function mockAddressFromSeed(seed: string): string {
  let h = hashString(seed);
  let hex = "";
  for (let i = 0; i < 10; i++) {
    hex += (h >>> 0).toString(16).padStart(8, "0");
    h = hashString(hex + String(i));
  }
  return `0x${hex.slice(0, 40)}`;
}

function pickHandle(h: number): string {
  const parts = ["river", "neon", "quiet", "cosmic", "ledger", "swift", "modular"];
  return `${parts[h % parts.length]}${(h >>> 4) % 10000}`;
}

function pickOrg(h: number): string | null {
  if (h % 4 === 0) return null;
  const roots = ["demo", "labs", "house", "guild", "works"];
  const a = roots[h % roots.length];
  const b = roots[(h >> 3) % roots.length];
  return `${a}.${b}`;
}

function normalizeAddrInput(s: string): string {
  const t = s.trim();
  if (ADDR_HEX64.test(t) && !t.startsWith("0x")) return `0x${t.slice(0, 40)}`;
  return t;
}

/**
 * Mock bidirectional resolve: @name / org.with.dot / bare handle → address,
 * or hex address → synthetic @name + optional org. `modulr` or `modulr.*` → same well-known key.
 */
export function mockResolve(query: string): MockResolveResult {
  const raw = query.trim();
  if (!raw) return { kind: "empty" };

  const asAddr = normalizeAddrInput(raw);
  if (ADDR_HEX.test(asAddr)) {
    const h = hashString(asAddr.toLowerCase());
    return {
      kind: "reverse",
      address: asAddr.toLowerCase(),
      name: `@${pickHandle(h)}`,
      org: pickOrg(h),
    };
  }

  /** Bare `modulr` or `modulr.suffix` — same system key in the mock. */
  if (/^modulr(\.|$)/i.test(raw)) {
    const label = raw.split(/\s/)[0]!;
    return {
      kind: "forward_modulr",
      label,
      address: MODULR_WELL_KNOWN_KEY_MOCK,
      note:
        "Reserved Modulr namespace — modulr and modulr.anything both map to the system registration public key (mock). Real Core would pin the actual key material.",
    };
  }

  if (raw.startsWith("@")) {
    const inner = raw.slice(1).trim();
    if (!inner) return { kind: "empty" };
    const addr = mockAddressFromSeed(`name:${inner.toLowerCase()}`);
    return {
      kind: "forward_name",
      label: `@${inner}`,
      address: addr,
      inferredAt: false,
    };
  }

  if (raw.includes(".")) {
    const addr = mockAddressFromSeed(`org:${raw.toLowerCase()}`);
    return {
      kind: "forward_org",
      label: raw.toLowerCase(),
      address: addr,
    };
  }

  const addr = mockAddressFromSeed(`name:${raw.toLowerCase()}`);
  return {
    kind: "forward_name",
    label: `@${raw}`,
    address: addr,
    inferredAt: true,
  };
}

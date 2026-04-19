export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export type MockModuleMetrics = {
  /** In-flight / queued work touching this module (homepage card). */
  activeJobs: number;
  modules: number;
  orgs: number;
  users: number;
  validators: number;
  /** Providers subscribed to this module; for Core, same basis as registered modules (avoid duplicate cards in UI). */
  providersSubscribed: number;
};

/** One slice for mock donut / pie charts (user mix, validator status, etc.). */
export type MockPieSlice = {
  key: string;
  label: string;
  count: number;
  color: string;
};

/**
 * Shared homepage donut palette — use these hexes everywhere so charts match.
 * Order: blue → Modulr gold → purple → green (fourth slice / 4+ categories).
 */
export const DASHBOARD_DONUT_PALETTE = [
  "#38bdf8",
  "#ffb700",
  "#8b5cf6",
  "#34d399",
] as const;

/** Named slots (same as palette indices 0–3). */
export const dashboardDonutSlice = {
  blue: DASHBOARD_DONUT_PALETTE[0],
  gold: DASHBOARD_DONUT_PALETTE[1],
  purple: DASHBOARD_DONUT_PALETTE[2],
  green: DASHBOARD_DONUT_PALETTE[3],
} as const;

export function dashboardDonutColorByIndex(index: number): string {
  return DASHBOARD_DONUT_PALETTE[index % DASHBOARD_DONUT_PALETTE.length]!;
}

/** Deterministic pretend metrics; `Modulr.Core` gets flagship-style numbers. */
export function getMockMetrics(moduleKey: string): MockModuleMetrics {
  const key = moduleKey.trim() || "Modulr.Core";
  if (key.toLowerCase() === "modulr.core") {
    const modules = 12408;
    return {
      activeJobs: 847,
      modules,
      orgs: 892,
      users: 45120,
      validators: 156,
      providersSubscribed: modules,
    };
  }
  const h = hashString(key);
  const modules = 3200 + (h % 9800);
  return {
    activeJobs: 210 + (h % 920),
    modules,
    orgs: 48 + (h % 510),
    users: 1800 + (h % 42000),
    validators: 18 + (h % 134),
    providersSubscribed: 120 + (h % 2400),
  };
}

/**
 * User-type counts for the role-mix pie (clients / validators / providers).
 * Integer counts sum to `getMockMetrics(moduleKey).users` (or zero if no users).
 */
export function getMockUserTypeMix(moduleKey: string): MockPieSlice[] {
  const m = getMockMetrics(moduleKey);
  const total = m.users;
  const key = moduleKey.trim() || "Modulr.Core";

  if (total <= 0) {
    return [
      { key: "clients", label: "Clients", count: 0, color: dashboardDonutSlice.blue },
      {
        key: "validators",
        label: "Validator users",
        count: 0,
        color: dashboardDonutSlice.gold,
      },
      { key: "providers", label: "Providers", count: 0, color: dashboardDonutSlice.purple },
    ];
  }

  if (key.toLowerCase() === "modulr.core") {
    const c = Math.round(total * 0.71);
    const v = Math.round(total * 0.08);
    const p = Math.max(0, total - c - v);
    return [
      { key: "clients", label: "Clients", count: c, color: dashboardDonutSlice.blue },
      {
        key: "validators",
        label: "Validator users",
        count: v,
        color: dashboardDonutSlice.gold,
      },
      { key: "providers", label: "Providers", count: p, color: dashboardDonutSlice.purple },
    ];
  }

  const h = hashString(key + ":userMix");
  const w0 = 52 + (h % 28);
  const w1 = 18 + ((h >> 4) % 22);
  const c = Math.round((total * w0) / 100);
  let v = Math.round((total * w1) / 100);
  let p = total - c - v;
  if (p < 0) {
    p = 0;
    v = Math.max(0, total - c);
  }
  return [
    { key: "clients", label: "Clients", count: c, color: dashboardDonutSlice.blue },
    {
      key: "validators",
      label: "Validator users",
      count: v,
      color: dashboardDonutSlice.gold,
    },
    { key: "providers", label: "Providers", count: p, color: dashboardDonutSlice.purple },
  ];
}

/**
 * Validator lifecycle mix: counts sum to `getMockMetrics(moduleKey).validators`
 * so the donut center matches the Validators metric card.
 */
export function getMockValidatorStatusMix(moduleKey: string): MockPieSlice[] {
  const m = getMockMetrics(moduleKey);
  const V = m.validators;
  const key = moduleKey.trim().toLowerCase();

  /** Same three hues as user mix: gold = spotlight / live, blue & purple for other bands. */
  const colors = {
    active: dashboardDonutSlice.gold,
    passive: dashboardDonutSlice.blue,
    offline: dashboardDonutSlice.purple,
  } as const;

  if (V <= 0) {
    return [
      { key: "active", label: "Active", count: 0, color: colors.active },
      { key: "passive", label: "Passive", count: 0, color: colors.passive },
      { key: "offline", label: "Offline", count: 0, color: colors.offline },
    ];
  }

  let a: number;
  let p: number;
  let o: number;

  if (key === "modulr.core") {
    a = Math.round(V * 0.58);
    p = Math.round(V * 0.26);
    o = V - a - p;
  } else {
    const h = hashString(moduleKey + ":valStatus");
    const pActive = 45 + (h % 35);
    const pPassive = 15 + ((h >> 3) % 28);
    a = Math.round((V * pActive) / 100);
    p = Math.round((V * pPassive) / 100);
    o = V - a - p;
    if (o < 0) {
      o = 0;
      p = Math.max(0, V - a);
    }
  }

  return [
    { key: "active", label: "Active", count: a, color: colors.active },
    { key: "passive", label: "Passive", count: p, color: colors.passive },
    { key: "offline", label: "Offline", count: o, color: colors.offline },
  ];
}

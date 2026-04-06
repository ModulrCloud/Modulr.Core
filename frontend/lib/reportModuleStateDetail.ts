/**
 * `report_module_state` payload.detail — JSON schema v1: core metrics, 24h health,
 * extra dashboard_cards (Core allows ≤10; UI uses 6 fixed metrics + up to 4 custom),
 * pies (≤4, ≤5 slices each).
 */

export const REPORT_MODULE_STATE_DETAIL_SCHEMA_VERSION = 1;

/** Core accepts up to this many `dashboard_cards` entries. */
export const MAX_DASHBOARD_CARDS = 10;
/** Additional cards in Methods UI (cards 7–10) beyond the six standard metrics. */
export const MAX_CUSTOM_DASHBOARD_CARDS = 4;
export const FIXED_STANDARD_METRIC_CARD_COUNT = 6;

export const FIXED_STANDARD_METRIC_CARDS: readonly {
  valueKey: string;
  title: string;
  description: string;
}[] = [
  {
    valueKey: "metric_total_users",
    title: "Total users",
    description: "User accounts or identities with any relationship to this module.",
  },
  {
    valueKey: "metric_active_users",
    title: "Active users",
    description: "Users with meaningful activity in the current reporting window.",
  },
  {
    valueKey: "metric_subscribers",
    title: "Subscribers",
    description: "Distinct identities subscribed to or entitled to this module’s services.",
  },
  {
    valueKey: "metric_validators",
    title: "Validators",
    description: "Validators registered or observed for this module (same total as the status pie below).",
  },
  {
    valueKey: "metric_providers",
    title: "Providers",
    description: "Independent service providers bound to this module.",
  },
  {
    valueKey: "metric_active_jobs",
    title: "Active jobs",
    description: "In-flight work, connections, or jobs touching this module.",
  },
];

export const VALIDATOR_STATUS_PIE_UI = {
  title: "Validator status",
  description:
    "Share of validators that are active, passive (standby), or offline. Slice labels are fixed; percents must sum to 100. Total matches the Validators card above.",
  slices: [
    { label: "Active", pctKey: "val_pct_active" },
    { label: "Passive", pctKey: "val_pct_passive" },
    { label: "Offline", pctKey: "val_pct_offline" },
  ],
} as const;

export const HEALTH_ACTIVITY_UI = {
  title: "Health & activity (24h)",
  description:
    "One numeric sample per clock hour (24 comma-separated values). Rates, scores, or error budgets — Core stores the series as-is.",
  valueKey: "health_activity_csv",
} as const;

export const NOTES_UI = {
  title: "Notes",
  description: "Optional human context; stored in JSON as detail.notes.",
  valueKey: "detail_notes",
} as const;

export const MAX_DASHBOARD_PIES = 4;
export const MAX_PIE_SLICES = 5;
export const MAX_CARD_DESCRIPTION_CHARS = 280;
export const MAX_PIE_DESCRIPTION_CHARS = 280;

export type DashboardCardInput = { title: string; value: string; description: string };
export type DashboardPieSliceInput = { label: string; percent: string };
export type DashboardPieInput = {
  metric_name: string;
  total: string;
  description: string;
  slices: DashboardPieSliceInput[];
};

export type ReportModuleDashboardState = {
  cards: DashboardCardInput[];
  pies: DashboardPieInput[];
};

function parseNonNegInt(raw: string | undefined, field: string): { ok: true; n: number } | { ok: false; error: string } {
  const s = raw?.trim() ?? "";
  if (!s) return { ok: false, error: `${field} is required` };
  if (!/^\d+$/.test(s)) return { ok: false, error: `${field} must be a non-negative integer` };
  const n = Number.parseInt(s, 10);
  if (n < 0 || n > Number.MAX_SAFE_INTEGER) return { ok: false, error: `${field} is out of range` };
  return { ok: true, n };
}

function parsePct(raw: string | undefined, field: string): { ok: true; n: number } | { ok: false; error: string } {
  const s = raw?.trim() ?? "";
  if (!s) return { ok: false, error: `${field} is required` };
  if (!/^\d{1,3}$/.test(s)) return { ok: false, error: `${field} must be an integer 0–100` };
  const n = Number.parseInt(s, 10);
  if (n < 0 || n > 100) return { ok: false, error: `${field} must be 0–100` };
  return { ok: true, n };
}

/** Parse 24 hourly samples (comma-separated numbers, e.g. success rate 0–1 per hour). */
export function parseHealthActivity24hCsv(raw: string | undefined): { ok: true; points: number[] } | { ok: false; error: string } {
  const s = raw?.trim() ?? "";
  if (!s) return { ok: false, error: "Health & activity (24 hourly values) is required" };
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 24) {
    return { ok: false, error: "Health & activity must be exactly 24 comma-separated numbers (one per hour)" };
  }
  const points: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const x = Number(parts[i]);
    if (!Number.isFinite(x)) {
      return { ok: false, error: `Hour ${i + 1} is not a valid number` };
    }
    points.push(x);
  }
  return { ok: true, points };
}

function buildDashboardCardsJson(
  cards: DashboardCardInput[],
): { ok: true; cards: { title: string; value: number; description: string }[] } | { ok: false; error: string } {
  const filled = cards.filter((c) => c.title.trim().length > 0);
  if (filled.length === 0) {
    return {
      ok: false,
      error:
        "Add at least one additional dashboard card (cards 7–10): title, value, description",
    };
  }
  if (filled.length > MAX_CUSTOM_DASHBOARD_CARDS) {
    return {
      ok: false,
      error: `At most ${MAX_CUSTOM_DASHBOARD_CARDS} additional cards (cards 7–10)`,
    };
  }
  const out: { title: string; value: number; description: string }[] = [];
  for (let i = 0; i < filled.length; i++) {
    const row = filled[i]!;
    const title = row.title.trim();
    const vi = parseNonNegInt(row.value, `Card ${i + 1} value`);
    if (!vi.ok) return vi;
    const desc = row.description.trim();
    if (!desc) return { ok: false, error: `Card “${title}”: description is required` };
    if (desc.length > MAX_CARD_DESCRIPTION_CHARS) {
      return {
        ok: false,
        error: `Card “${title}”: description must be at most ${MAX_CARD_DESCRIPTION_CHARS} characters`,
      };
    }
    out.push({ title, value: vi.n, description: desc });
  }
  return { ok: true, cards: out };
}

function buildDashboardPiesJson(
  pies: DashboardPieInput[],
): {
  ok: true;
  pies: {
    metric_name: string;
    total: number;
    description: string | null;
    slices: { label: string; percent: number }[];
  }[];
} | { ok: false; error: string } {
  const filled = pies.filter((p) => p.metric_name.trim().length > 0);
  if (filled.length > MAX_DASHBOARD_PIES) {
    return { ok: false, error: `At most ${MAX_DASHBOARD_PIES} pie charts allowed` };
  }
  const out: {
    metric_name: string;
    total: number;
    description: string | null;
    slices: { label: string; percent: number }[];
  }[] = [];
  for (let pi = 0; pi < filled.length; pi++) {
    const pie = filled[pi]!;
    const metricName = pie.metric_name.trim();
    const ti = parseNonNegInt(pie.total, `Pie “${metricName}” total`);
    if (!ti.ok) return ti;
    const descRaw = pie.description.trim();
    if (descRaw.length > MAX_PIE_DESCRIPTION_CHARS) {
      return {
        ok: false,
        error: `Pie “${metricName}”: description must be at most ${MAX_PIE_DESCRIPTION_CHARS} characters`,
      };
    }
    const description = descRaw.length > 0 ? descRaw : null;
    const slicesIn = pie.slices.filter((s) => s.label.trim().length > 0 && s.percent.trim().length > 0);
    if (slicesIn.length === 0) {
      return { ok: false, error: `Pie “${metricName}”: add at least one slice (label + %)` };
    }
    if (slicesIn.length > MAX_PIE_SLICES) {
      return { ok: false, error: `Pie “${metricName}”: at most ${MAX_PIE_SLICES} slices (palette limit)` };
    }
    const slices: { label: string; percent: number }[] = [];
    let sum = 0;
    for (let si = 0; si < slicesIn.length; si++) {
      const sl = slicesIn[si]!;
      const label = sl.label.trim();
      if (!label) return { ok: false, error: `Pie “${metricName}” slice ${si + 1}: label is required` };
      const pct = parsePct(sl.percent, `Pie “${metricName}” slice “${label}” %`);
      if (!pct.ok) return pct;
      sum += pct.n;
      slices.push({ label, percent: pct.n });
    }
    if (sum !== 100) {
      return {
        ok: false,
        error: `Pie “${metricName}”: slice percents must sum to 100 (currently ${sum})`,
      };
    }
    out.push({ metric_name: metricName, total: ti.n, description, slices });
  }
  return { ok: true, pies: out };
}

export type ComposeReportDetailResult = { ok: true; detail: string } | { ok: false; error: string };

export function defaultReportModuleDashboard(): ReportModuleDashboardState {
  return {
    cards: [
      {
        title: "Spotlight metric",
        value: "1",
        description:
          "First additional homepage card (slot 7). Edit title/value/description or add more up to four extras.",
      },
    ],
    pies: [
      {
        metric_name: "Users by role",
        total: "45120",
        description: "User-type mix for the homepage donut (custom pie).",
        slices: [
          { label: "Clients", percent: "71" },
          { label: "Validator users", percent: "8" },
          { label: "Providers", percent: "21" },
        ],
      },
    ],
  };
}

/**
 * Builds JSON for `detail` from Methods form fields + dashboard cards/pies.
 */
export function composeReportModuleStateDetailJson(
  values: Record<string, string>,
  dashboard: ReportModuleDashboardState,
): ComposeReportDetailResult {
  const m = (name: string, label: string) => parseNonNegInt(values[name], label);
  const a = m("metric_total_users", "Total users");
  if (!a.ok) return a;
  const b = m("metric_active_users", "Active users");
  if (!b.ok) return b;
  const c = m("metric_subscribers", "Subscribers");
  if (!c.ok) return c;
  const d = m("metric_validators", "Validators");
  if (!d.ok) return d;
  const e = m("metric_providers", "Providers");
  if (!e.ok) return e;
  const f = m("metric_active_jobs", "Active jobs");
  if (!f.ok) return f;

  const va = parsePct(values.val_pct_active, "Validator status — active %");
  if (!va.ok) return va;
  const vp = parsePct(values.val_pct_passive, "Validator status — passive %");
  if (!vp.ok) return vp;
  const vo = parsePct(values.val_pct_offline, "Validator status — offline %");
  if (!vo.ok) return vo;
  if (va.n + vp.n + vo.n !== 100) {
    return { ok: false, error: "Validator status percentages must sum to 100" };
  }

  const hp = parseHealthActivity24hCsv(values.health_activity_csv);
  if (!hp.ok) return hp;

  const dc = buildDashboardCardsJson(dashboard.cards);
  if (!dc.ok) return dc;
  const dp = buildDashboardPiesJson(dashboard.pies);
  if (!dp.ok) return dp;

  const notes = values.detail_notes?.trim();
  const obj: Record<string, unknown> = {
    schema_version: REPORT_MODULE_STATE_DETAIL_SCHEMA_VERSION,
    metrics: {
      total_users: a.n,
      active_users: b.n,
      subscribers: c.n,
      validators: d.n,
      providers: e.n,
      active_jobs: f.n,
    },
    validator_status_pct: {
      active: va.n,
      passive: vp.n,
      offline: vo.n,
    },
    health_activity_24h: {
      granularity_hours: 1,
      points: hp.points,
    },
    dashboard_cards: dc.cards,
    dashboard_pies: dp.pies,
  };
  if (notes) obj.notes = notes;

  return { ok: true, detail: JSON.stringify(obj) };
}

/** Deterministic demo values for scalar form fields (cards/pies use defaultReportModuleDashboard). */
export function reportModuleStateMockFormPatch(): Record<string, string> {
  const val = { a: 0, b: 0, c: 0 };
  const r1 = 0.31;
  const r2 = 0.27;
  const r3 = 0.42;
  const t = r1 + r2 + r3;
  val.a = Math.round((r1 / t) * 100);
  val.b = Math.round((r2 / t) * 100);
  val.c = 100 - val.a - val.b;
  const points = Array.from({ length: 24 }, (_, i) =>
    Number((0.82 + (i % 5) * 0.02 + (i % 3) * 0.01).toFixed(4)),
  );
  return {
    metric_total_users: "45120",
    metric_active_users: "12840",
    metric_subscribers: "38900",
    metric_validators: "156",
    metric_providers: "412",
    metric_active_jobs: "847",
    val_pct_active: String(val.a),
    val_pct_passive: String(val.b),
    val_pct_offline: String(val.c),
    health_activity_csv: points.join(", "),
    detail_notes: "Playground sample — swap numbers to match your module.",
  };
}

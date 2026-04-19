import { hashString } from "@/components/dashboard/mockModuleMetrics";
import {
  composeReportModuleStateDetailJson,
  defaultReportModuleDashboard,
} from "@/lib/reportModuleStateDetail";

export type MethodParam = {
  name: string;
  label: string;
  placeholder: string;
  /** omit or true = optional */
  required?: boolean;
  /** Renders as a select when set */
  options?: { value: string; label: string }[];
  /** Renders as textarea */
  multiline?: boolean;
  /** When true, value is collected but rendered in a custom block (e.g. report_module_state). */
  hidden?: boolean;
};

/** Which product slice this method belongs to (matches planned wire catalog). */
export type MethodCategory = "protocol" | "validator" | "provider" | "client";

export const METHOD_CATEGORY_TABS: readonly {
  id: MethodCategory;
  label: string;
  description: string;
}[] = [
  {
    id: "protocol",
    label: "Protocol",
    description:
      "Wire version, discovery, branding (org logo / user profile get & set), routes, registration, liveness, and writes Core persists — signed POST /message.",
  },
  {
    id: "validator",
    label: "Validator",
    description:
      "Read-heavy coordination: lookups, module catalog, routes, resolution — signed POST /message.",
  },
  {
    id: "provider",
    label: "Provider",
    description: "Workload modules — operations they expose once manifests exist.",
  },
  {
    id: "client",
    label: "Client",
    description: "Typical app-originated flows — placeholder until defined.",
  },
];

export type MethodDef = {
  id: string;
  title: string;
  summary: string;
  category: MethodCategory;
  /**
   * MVP: handler implemented on modulr.core only (coordination plane). Omit for
   * network-wide protocol_surface methods every module is expected to speak.
   */
  coreSurface?: boolean;
  params: MethodParam[];
};

/**
 * Planned wire surface (not implemented in Core yet): **module branding** — let
 * module creators attach a logo for explorers / shell (format policy TBD; SVG is a
 * strong default). Tracked in the repo README section “Planned: module branding”.
 */

export const METHOD_CATALOG: MethodDef[] = [
  {
    id: "get_protocol_version",
    title: "get_protocol_version",
    summary: "Return the active protocol version string Core is speaking.",
    category: "protocol",
    params: [],
  },
  {
    id: "get_protocol_methods",
    title: "get_protocol_methods",
    summary:
      "List protocol-level wire methods (version surface, discovery, genesis branding read, liveness, …).",
    category: "protocol",
    params: [],
  },
  {
    id: "get_core_genesis_branding",
    title: "get_core_genesis_branding",
    summary:
      "Legacy bundle: root org SVG, operator profile (base64), labels — prefer get_organization_logo / get_user_profile_image.",
    category: "protocol",
    coreSurface: true,
    params: [],
  },
  {
    id: "get_organization_logo",
    title: "get_organization_logo",
    summary:
      "Return an organization brand logo (SVG). Pass exactly one of organization_key or organization_signing_public_key_hex.",
    category: "protocol",
    coreSurface: true,
    params: [
      {
        name: "organization_key",
        label: "Organization key (name)",
        placeholder: "Single-label or dotted org (e.g. modulr or acme.network)",
        required: false,
      },
      {
        name: "organization_signing_public_key_hex",
        label: "Organization Ed25519 public key (hex)",
        placeholder: "64 hex chars — leave name empty if using this",
        required: false,
      },
    ],
  },
  {
    id: "get_user_profile_image",
    title: "get_user_profile_image",
    summary:
      "Return a user profile image (base64 + MIME). Pass exactly one of user_handle or user_signing_public_key_hex.",
    category: "protocol",
    coreSurface: true,
    params: [
      {
        name: "user_handle",
        label: "User handle",
        placeholder: "@alice or alice — leave empty if using pubkey",
        required: false,
      },
      {
        name: "user_signing_public_key_hex",
        label: "User Ed25519 public key (hex)",
        placeholder: "64 hex chars",
        required: false,
      },
    ],
  },
  {
    id: "get_user_description",
    title: "get_user_description",
    summary:
      "Return the public user description (bio). Pass exactly one of user_handle or user_signing_public_key_hex.",
    category: "protocol",
    coreSurface: true,
    params: [
      {
        name: "user_handle",
        label: "User handle",
        placeholder: "@alice or alice — leave empty if using pubkey",
        required: false,
      },
      {
        name: "user_signing_public_key_hex",
        label: "User Ed25519 public key (hex)",
        placeholder: "64 hex chars",
        required: false,
      },
    ],
  },
  {
    id: "set_organization_logo",
    title: "set_organization_logo",
    summary:
      "Create or replace an org SVG logo. Sender must match organization_signing_public_key_hex or be bootstrap.",
    category: "protocol",
    coreSurface: true,
    params: [
      {
        name: "organization_signing_public_key_hex",
        label: "Organization Ed25519 public key (hex)",
        placeholder: "64 hex chars",
        required: true,
      },
      {
        name: "organization_key",
        label: "Organization key (optional)",
        placeholder: "Scopes the stored row when set",
        required: false,
      },
      {
        name: "logo_svg",
        label: "Logo SVG markup",
        placeholder: "<svg ...> or empty to clear",
        required: false,
        multiline: true,
      },
    ],
  },
  {
    id: "set_user_profile_image",
    title: "set_user_profile_image",
    summary:
      "Create or replace a user profile image. Sender must match user_signing_public_key_hex or be bootstrap.",
    category: "protocol",
    coreSurface: true,
    params: [
      {
        name: "user_signing_public_key_hex",
        label: "User Ed25519 public key (hex)",
        placeholder: "64 hex chars",
        required: true,
      },
      {
        name: "user_handle",
        label: "User handle (optional)",
        placeholder: "Scopes the stored row",
        required: false,
      },
      {
        name: "profile_image_base64",
        label: "Profile image (standard base64)",
        placeholder: "No data: prefix — empty with MIME empty to clear",
        required: false,
        multiline: true,
      },
      {
        name: "profile_image_mime",
        label: "MIME type",
        placeholder: "e.g. image/png",
        required: false,
      },
    ],
  },
  {
    id: "set_user_description",
    title: "set_user_description",
    summary:
      "Create or replace the public user description (bio). Sender must match user_signing_public_key_hex or be bootstrap.",
    category: "protocol",
    coreSurface: true,
    params: [
      {
        name: "user_signing_public_key_hex",
        label: "User Ed25519 public key (hex)",
        placeholder: "64 hex chars",
        required: true,
      },
      {
        name: "user_handle",
        label: "User handle (optional)",
        placeholder: "Mirrors the row under h:<handle> as well as p:<pubkey>",
        required: false,
      },
      {
        name: "description",
        label: "Description (bio)",
        placeholder: "Short public bio — empty to clear",
        required: false,
        multiline: true,
      },
    ],
  },
  {
    id: "lookup_module",
    title: "lookup_module",
    summary: "Resolve a module name to metadata and availability.",
    category: "validator",
    coreSurface: true,
    params: [
      {
        name: "module_name",
        label: "Module name",
        placeholder: "e.g. modulr.storage",
        required: true,
      },
    ],
  },
  {
    id: "get_module_methods",
    title: "get_module_methods",
    summary: "List wire methods a module advertises (for explorers and clients).",
    category: "validator",
    params: [
      {
        name: "module_id",
        label: "Module id",
        placeholder: "e.g. modulr.core",
        required: true,
      },
    ],
  },
  {
    id: "submit_module_route",
    title: "submit_module_route",
    summary:
      "Modules push their reachable route to Core (not “IP” by name — route_type stays protocol-agnostic; today values are IP-style until other transports land).",
    category: "protocol",
    coreSurface: true,
    params: [
      {
        name: "module_id",
        label: "Module id",
        placeholder: "e.g. modulr.storage",
        required: true,
      },
      {
        name: "route_type",
        label: "Route type",
        placeholder: "",
        required: true,
        options: [
          { value: "ip", label: "IP (current default)" },
          { value: "dns", label: "DNS (reserved / future)" },
          { value: "onion", label: "onion (future)" },
        ],
      },
      {
        name: "route",
        label: "Route",
        placeholder: "e.g. 203.0.113.10:8443 or host:port Core should dial",
        required: true,
      },
      {
        name: "mode",
        label: "Mode",
        placeholder: "",
        required: false,
        options: [
          { value: "merge", label: "merge — add/update one dial (default in this form; modulr.core: bootstrap when locked)" },
          { value: "replace_all", label: "replace_all — drop other dials, keep only this one (API default if mode omitted)" },
        ],
      },
      {
        name: "priority",
        label: "Priority",
        placeholder: "integer; lower = try first (default 0)",
        required: false,
      },
      {
        name: "endpoint_signing_public_key_hex",
        label: "Endpoint Ed25519 pubkey hex",
        placeholder: "64 lowercase hex chars",
        required: false,
      },
    ],
  },
  {
    id: "remove_module_route",
    title: "remove_module_route",
    summary:
      "Drop one stored dial for a module (same module_id + route_type + route as submit). Registered modules sign with their module key; modulr.core removals require a bootstrap key when dev_mode is off.",
    category: "protocol",
    coreSurface: true,
    params: [
      {
        name: "module_id",
        label: "Module id",
        placeholder: "e.g. modulr.storage",
        required: true,
      },
      {
        name: "route_type",
        label: "Route type",
        placeholder: "",
        required: true,
        options: [
          { value: "ip", label: "IP (current default)" },
          { value: "dns", label: "DNS (reserved / future)" },
          { value: "onion", label: "onion (future)" },
        ],
      },
      {
        name: "route",
        label: "Route",
        placeholder: "exact host:port to remove (must match a stored dial)",
        required: true,
      },
    ],
  },
  {
    id: "get_module_route",
    title: "get_module_route",
    summary:
      "Read back a module’s published route, how it reaches peer networks, and (for modulr.core) active validators.",
    category: "validator",
    coreSurface: true,
    params: [
      {
        name: "module_id",
        label: "Module id",
        placeholder: "e.g. modulr.core",
        required: true,
      },
    ],
  },
  {
    id: "report_module_state",
    title: "report_module_state",
    summary:
      "Coarse lifecycle phase plus required dashboard-metrics JSON (schema v1): card-style counts, validator status %, 24 hourly health samples. Heartbeat_update is liveness; this is the rollup snapshot for explorers.",
    category: "protocol",
    params: [
      {
        name: "module_id",
        label: "Module id",
        placeholder: "e.g. modulr.storage",
        required: true,
      },
      {
        name: "state_phase",
        label: "Lifecycle phase",
        placeholder: "",
        required: true,
        options: [
          { value: "running", label: "running — operating normally" },
          { value: "syncing", label: "syncing — catching up" },
          { value: "degraded", label: "degraded — reduced capacity" },
          { value: "maintenance", label: "maintenance — intentional downtime" },
        ],
      },
      {
        name: "metric_total_users",
        label: "Total users",
        placeholder: "integer",
        required: true,
        hidden: true,
      },
      {
        name: "metric_active_users",
        label: "Active users",
        placeholder: "integer",
        required: true,
        hidden: true,
      },
      {
        name: "metric_subscribers",
        label: "Subscribers",
        placeholder: "integer",
        required: true,
        hidden: true,
      },
      {
        name: "metric_validators",
        label: "Validators",
        placeholder: "integer (count on this module)",
        required: true,
        hidden: true,
      },
      {
        name: "metric_providers",
        label: "Providers",
        placeholder: "integer",
        required: true,
        hidden: true,
      },
      {
        name: "metric_active_jobs",
        label: "Active jobs",
        placeholder: "integer",
        required: true,
        hidden: true,
      },
      {
        name: "val_pct_active",
        label: "Validator status — active %",
        placeholder: "0–100",
        required: true,
        hidden: true,
      },
      {
        name: "val_pct_passive",
        label: "Validator status — passive %",
        placeholder: "0–100",
        required: true,
        hidden: true,
      },
      {
        name: "val_pct_offline",
        label: "Validator status — offline %",
        placeholder: "0–100 (must sum to 100 with active + passive)",
        required: true,
        hidden: true,
      },
      {
        name: "ha_jobs_csv",
        label: "Health — jobs (24 hourly values)",
        placeholder: "24 comma-separated non-negative numbers",
        required: true,
        multiline: true,
        hidden: true,
      },
      {
        name: "ha_aux1_label",
        label: "Health — auxiliary series 1 label",
        placeholder: "max 40 characters",
        required: true,
        hidden: true,
      },
      {
        name: "ha_aux1_csv",
        label: "Health — auxiliary series 1 (24 values)",
        placeholder: "24 comma-separated non-negative numbers",
        required: true,
        multiline: true,
        hidden: true,
      },
      {
        name: "ha_aux2_label",
        label: "Health — auxiliary series 2 label",
        placeholder: "max 40 characters",
        required: true,
        hidden: true,
      },
      {
        name: "ha_aux2_csv",
        label: "Health — auxiliary series 2 (24 values)",
        placeholder: "24 comma-separated non-negative numbers",
        required: true,
        multiline: true,
        hidden: true,
      },
      {
        name: "detail_notes",
        label: "Notes",
        placeholder: "Human-readable context; stored inside JSON as notes",
        required: false,
        multiline: true,
        hidden: true,
      },
    ],
  },
  {
    id: "get_module_state",
    title: "get_module_state",
    summary:
      "Read the latest snapshot Core stored from report_module_state (nulls until that module has reported).",
    category: "validator",
    params: [
      {
        name: "module_id",
        label: "Module id",
        placeholder: "e.g. modulr.core",
        required: true,
      },
    ],
  },
  {
    id: "publish_module_signature",
    title: "publish_module_signature",
    summary:
      "Publish a cryptographic proof that the party registering this module is who they claim to be (e.g. signature over a manifest or release digest) — not “upload source to Core.”",
    category: "protocol",
    coreSurface: true,
    params: [
      {
        name: "module_id",
        label: "Module id",
        placeholder: "e.g. modulr.assets",
        required: true,
      },
      {
        name: "signed_subject_digest",
        label: "Signed subject digest",
        placeholder: "e.g. sha256:… of manifest, artifact, or attestation document",
        required: true,
      },
      {
        name: "proof_payload",
        label: "Proof / signature",
        placeholder: "Detached signature, attestation blob, or proof package (wire format TBD)",
        required: true,
        multiline: true,
      },
      {
        name: "context_notes",
        label: "Context (optional)",
        placeholder: "Optional human-readable context (semver, release id, …)",
        required: false,
        multiline: true,
      },
    ],
  },
  {
    id: "register_org",
    title: "register_org",
    summary:
      "Register an apex org (name + resolved_id) and optionally the module row (signing_public_key + route).",
    category: "protocol",
    coreSurface: true,
    params: [
      {
        name: "organization_key",
        label: "Organization apex",
        placeholder: "e.g. modulr.assets or acme.network",
        required: true,
      },
    ],
  },
  {
    id: "register_name",
    title: "register_name",
    summary: "Reserve a human-facing handle bound to an identity.",
    category: "protocol",
    coreSurface: true,
    params: [
      {
        name: "name_handle",
        label: "Name / handle",
        placeholder: "e.g. @river or river",
        required: true,
      },
    ],
  },
  {
    id: "resolve_name",
    title: "resolve_name",
    summary: "Map a name or org label to a target address or record.",
    category: "validator",
    coreSurface: true,
    params: [
      {
        name: "query",
        label: "Query",
        placeholder: "@you, org.key, or modulr",
        required: true,
      },
    ],
  },
  {
    id: "reverse_resolve_name",
    title: "reverse_resolve_name",
    summary: "From a public key or address back to bound names / orgs.",
    category: "validator",
    coreSurface: true,
    params: [
      {
        name: "address",
        label: "Address or pubkey",
        placeholder: "0x… or base58-style id",
        required: true,
      },
    ],
  },
  {
    id: "heartbeat_update",
    title: "heartbeat_update",
    summary: "Lightweight liveness and sync signal for a connected module.",
    category: "protocol",
    params: [
      {
        name: "module_id",
        label: "Module id",
        placeholder: "e.g. modulr.core",
        required: true,
      },
      {
        name: "note",
        label: "Note",
        placeholder: "e.g. validator set synced",
        required: false,
      },
    ],
  },
];

function stableAddr(seed: string): string {
  const h = hashString(seed);
  let hex = (h >>> 0).toString(16).padStart(8, "0");
  for (let i = 0; i < 8; i++) {
    hex += (hashString(hex + seed + i) >>> 0).toString(16).padStart(8, "0");
  }
  return `0x${hex.slice(0, 40)}`;
}

/** Wire method names modulr.core advertises — aligned with Core `CORE_OPERATIONS` (sorted for display). */
const CORE_OPERATION_NAMES = [
  "get_core_genesis_branding",
  "get_module_methods",
  "get_module_route",
  "get_module_state",
  "get_organization_logo",
  "get_protocol_methods",
  "get_protocol_version",
  "get_user_description",
  "get_user_profile_image",
  "heartbeat_update",
  "lookup_module",
  "register_name",
  "register_org",
  "remove_module_route",
  "report_module_state",
  "resolve_name",
  "reverse_resolve_name",
  "set_organization_logo",
  "set_user_description",
  "set_user_profile_image",
  "submit_module_route",
] as const;

/** Same set as Core `PROTOCOL_METHOD_OPERATIONS` (protocol_surface), sorted. */
const PROTOCOL_METHOD_NAMES = [
  "get_core_genesis_branding",
  "get_module_state",
  "get_organization_logo",
  "get_protocol_methods",
  "get_protocol_version",
  "get_user_description",
  "get_user_profile_image",
  "heartbeat_update",
  "report_module_state",
  "set_organization_logo",
  "set_user_description",
  "set_user_profile_image",
] as const;

type MockWireMethodRow = {
  method: string;
  category: string;
  group: string;
  summary: string;
  description: string;
  payload_contract: string;
  protocol_surface: boolean;
};

function mockCatalogRow(method: string): MockWireMethodRow {
  const protocolSurface = (PROTOCOL_METHOD_NAMES as readonly string[]).includes(method);
  let group = "coordination";
  if (protocolSurface) {
    if (method === "heartbeat_update") group = "liveness";
    else if (method === "get_protocol_version") group = "version";
    else if (
      method === "get_core_genesis_branding" ||
      method === "get_organization_logo" ||
      method === "get_user_description" ||
      method === "get_user_profile_image" ||
      method === "set_organization_logo" ||
      method === "set_user_description" ||
      method === "set_user_profile_image"
    )
      group = "branding";
    else group = "discovery";
  }
  return {
    method,
    category: protocolSurface ? "protocol" : "validator",
    group,
    summary: `Mock summary for ${method}.`,
    description: `Placeholder catalog text for ${method} in the customer UI mock; live Core returns full metadata (bounded length).`,
    payload_contract: "mock",
    protocol_surface: protocolSurface,
  };
}

/** Deterministic pretend Core payload — not wired to the real service. */
export function buildMockMethodResponse(
  operation: string,
  payload: Record<string, string>,
): Record<string, unknown> {
  const seed = hashString(`${operation}:${JSON.stringify(payload)}`);
  const now = new Date().toISOString();

  switch (operation) {
    case "get_protocol_version":
      return {
        status: "ok",
        protocol_version: "2026.03.22.0",
        core_build: "mock-frontend",
        server_time: now,
      };
    case "get_protocol_methods": {
      const methods = [...PROTOCOL_METHOD_NAMES].map((m) => mockCatalogRow(m));
      return {
        status: "ok",
        catalog_schema_version: 1,
        methods,
        method_count: methods.length,
        request_id: `req_${(seed >>> 0).toString(16).slice(0, 12)}`,
        server_time: now,
      };
    }
    case "get_core_genesis_branding":
      return {
        status: "ok",
        genesis_complete: true,
        root_organization_label: "mock",
        bootstrap_operator_display_name: "Mock",
        root_organization_logo_svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"/>",
        operator_profile_image_base64: null,
        operator_profile_image_mime: null,
        server_time: now,
      };
    case "lookup_module": {
      const name = payload.module_name?.trim() || "unknown";
      return {
        status: "ok",
        module_name: name,
        registered: seed % 7 !== 0,
        advertised_version: `0.${(seed % 9) + 1}.${(seed >> 2) % 20}`,
        endpoints_preview: [`https://mock.modulr.invalid/${name.replace(/\./g, "/")}`],
        request_id: `req_${(seed >>> 0).toString(16).slice(0, 12)}`,
      };
    }
    case "get_module_methods": {
      const mid = payload.module_id?.trim() || "modulr.core";
      const isCore = mid.toLowerCase() === "modulr.core";
      const idList = isCore
        ? [...CORE_OPERATION_NAMES]
        : ["ping", "query_state", "submit_batch", "stream_events"];
      const methods = isCore
        ? idList.map((m) => mockCatalogRow(m)).sort((a, b) => a.method.localeCompare(b.method))
        : idList.map((m) => ({
            method: m,
            category: "provider",
            group: "workload",
            summary: `Mock workload method ${m}.`,
            description: "Non-core module mock entry.",
            payload_contract: "mock",
            protocol_surface: false,
          }));
      return {
        status: "ok",
        catalog_schema_version: 1,
        module_id: mid,
        methods,
        method_count: methods.length,
        request_id: `req_${(seed >>> 0).toString(16).slice(0, 12)}`,
      };
    }
    case "submit_module_route":
      return {
        status: "accepted_mock",
        module_id: payload.module_id?.trim(),
        route_type: payload.route_type?.trim() || "ip",
        route: payload.route?.trim(),
        mode: payload.mode?.trim() || "merge",
        priority: (() => {
          const raw = payload.priority?.trim();
          if (!raw) return 0;
          const n = Number.parseInt(raw, 10);
          return Number.isNaN(n) ? 0 : n;
        })(),
        indexed_at: now,
        message:
          "Core would merge this into the canonical routing table so clients resolve the module without assuming IPv4/v6 — route_type carries the transport family.",
      };
    case "remove_module_route":
      return {
        status: "accepted_mock",
        module_id: payload.module_id?.trim(),
        route_type: payload.route_type?.trim() || "ip",
        route: payload.route?.trim(),
        removed_at: now,
        message: "Core would delete this dial row if it exists; live Core uses signed POST /message.",
      };
    case "get_module_route": {
      const mid = payload.module_id?.trim() || "modulr.core";
      const isCore = mid.toLowerCase() === "modulr.core";
      const oct = (n: number) => Math.abs(n) % 253 + 1;
      const host = `${oct(seed)}.${oct(seed >> 4)}.${oct(seed >> 8)}.${oct(seed >> 12)}`;
      const port = 8000 + (seed % 4000);
      const networkResolutions = [
        `modulr.observability — ip — 10.${oct(seed + 1)}.${oct(seed + 2)}.${oct(seed + 3)}:9100`,
        `registry.bootstrap — ip — 198.51.100.${oct(seed)}:443`,
        `peer.relay.shard-${(seed % 4) + 1} — ip — 192.0.2.${oct(seed >> 2)}:22000`,
      ];
      const validators = [
        `val_${(seed >>> 0).toString(16).slice(0, 6)} — ip — 203.0.113.${10 + (seed % 6)}:8443 — active`,
        `val_${((seed >> 8) >>> 0).toString(16).slice(0, 6)} — ip — 203.0.113.${20 + (seed % 6)}:8443 — active`,
        `val_${((seed >> 16) >>> 0).toString(16).slice(0, 6)} — ip — 203.0.113.${30 + (seed % 6)}:8443 — standby`,
      ];
      return {
        status: "ok",
        module_id: mid,
        route_type: "ip",
        route: `${host}:${port}`,
        protocol_note:
          "Field names stay transport-neutral; values are IP-style today and can become QUIC, Tor, etc. without renaming the API.",
        network_resolutions: networkResolutions,
        ...(isCore ? { active_validators: validators } : {}),
      };
    }
    case "report_module_state": {
      const composed = composeReportModuleStateDetailJson(payload, defaultReportModuleDashboard());
      return {
        status: "accepted_mock",
        module_id: payload.module_id?.trim(),
        state_phase: payload.state_phase?.trim(),
        detail: composed.ok ? composed.detail : null,
        detail_error: composed.ok ? null : composed.error,
        recorded_at: now,
      };
    }
    case "get_module_state": {
      const mid = payload.module_id?.trim() || "modulr.core";
      const phases = ["running", "syncing", "degraded", "maintenance"] as const;
      return {
        status: "ok",
        module_id: mid,
        last_reported_phase: phases[seed % phases.length],
        last_reported_detail:
          "Mock snapshot — in production this reflects the latest report_module_state envelope.",
        last_updated_at: new Date(Date.now() - (seed % 3600) * 1000).toISOString(),
      };
    }
    case "publish_module_signature": {
      const digest = payload.signed_subject_digest?.trim() || "";
      return {
        status: "accepted_mock",
        module_id: payload.module_id?.trim(),
        signed_subject_digest: digest || null,
        proof_registered_hint: digest.length > 8 && seed % 5 !== 0,
        context_notes: payload.context_notes?.trim() || null,
        recorded_at: now,
        message:
          "Core would verify the proof binds this module identity to the publisher’s claimed key or upstream identity — not store module source here.",
      };
    }
    case "register_org":
      return {
        status: "accepted_mock",
        organization_key: payload.organization_key?.trim(),
        anchor_usd_floor_next: 100 * Math.pow(2, seed % 4),
        registration_id: `org_${(seed >>> 0).toString(16)}`,
        module_registered: Boolean(
          payload.signing_public_key && String(payload.signing_public_key).trim(),
        ),
      };
    case "register_name":
      return {
        status: "accepted_mock",
        handle: payload.name_handle?.trim(),
        tier_hint: ["single", "short", "standard"][(seed >> 3) % 3],
        registration_id: `name_${(seed >>> 0).toString(16)}`,
      };
    case "resolve_name": {
      const q = payload.query?.trim() || "";
      return {
        status: "ok",
        query: q,
        resolved_address: stableAddr(`resolve:${q}`),
        record_type: q.includes(".") ? "organization" : "name",
        ttl_seconds: 300 + (seed % 120),
      };
    }
    case "reverse_resolve_name":
      return {
        status: "ok",
        address: payload.address?.trim(),
        primary_name: `@${["swift", "ledger", "neon"][seed % 3]}${seed % 9000}`,
        organizations: seed % 2 === 0 ? [] : ["labs.demo", "guild.modulr"],
      };
    case "heartbeat_update":
      return {
        status: "ok",
        module_id: payload.module_id?.trim(),
        received_at: now,
        peers_seen: 12 + (seed % 40),
        note: payload.note?.trim() || null,
      };
    case "get_organization_logo":
      return {
        status: "ok",
        organization_key: payload.organization_key?.trim() || "mock",
        organization_signing_public_key_hex: "a".repeat(64),
        logo_svg:
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
          '<rect width="64" height="64" fill="#f60"/></svg>',
        source: "mock",
        server_time: now,
      };
    case "get_user_description":
      return {
        status: "ok",
        user_handle: "mock",
        user_signing_public_key_hex: "b".repeat(64),
        description: "Mock public bio — set once on Core, reuse in every app.",
        source: "mock",
        server_time: now,
      };
    case "get_user_profile_image":
      return {
        status: "ok",
        user_handle: "mock",
        user_signing_public_key_hex: "b".repeat(64),
        profile_image_base64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        profile_image_mime: "image/png",
        source: "mock",
        server_time: now,
      };
    case "set_organization_logo":
      return {
        status: "ok",
        organization_key: payload.organization_key?.trim() || null,
        organization_signing_public_key_hex:
          payload.organization_signing_public_key_hex?.trim() || "",
        logo_svg_stored: true,
        server_time: now,
      };
    case "set_user_profile_image":
      return {
        status: "ok",
        user_handle: payload.user_handle?.trim() || null,
        user_signing_public_key_hex: payload.user_signing_public_key_hex?.trim() || "",
        profile_image_stored: Boolean(payload.profile_image_base64?.trim()),
        server_time: now,
      };
    case "set_user_description":
      return {
        status: "ok",
        user_handle: payload.user_handle?.trim() || null,
        user_signing_public_key_hex: payload.user_signing_public_key_hex?.trim() || "",
        description: payload.description?.trim() || null,
        server_time: now,
      };
    default:
      return { status: "unknown_operation", operation };
  }
}

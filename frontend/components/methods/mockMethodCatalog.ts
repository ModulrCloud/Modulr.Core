import { hashString } from "@/components/dashboard/mockModuleMetrics";

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
};

export type MethodDef = {
  id: string;
  title: string;
  summary: string;
  params: MethodParam[];
};

export const METHOD_CATALOG: MethodDef[] = [
  {
    id: "get_protocol_version",
    title: "get_protocol_version",
    summary: "Return the active protocol version string Core is speaking.",
    params: [],
  },
  {
    id: "lookup_module",
    title: "lookup_module",
    summary: "Resolve a module name to metadata and availability.",
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
    id: "get_module_functions",
    title: "get_module_functions",
    summary: "List operations a module advertises (for explorers and clients).",
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
          { value: "replace_all", label: "replace_all — single canonical dial (default if omitted)" },
          { value: "merge", label: "merge — add/update one dial (modulr.core: bootstrap only when locked)" },
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
        label: "Endpoint Ed25519 pubkey hex (optional)",
        placeholder: "64 lowercase hex chars",
        required: false,
      },
    ],
  },
  {
    id: "get_module_route",
    title: "get_module_route",
    summary:
      "Read back a module’s published route, how it reaches peer networks, and (for modulr.core) active validators.",
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
    summary: "Module reports where it is in its lifecycle (syncing, running, degraded, …).",
    params: [
      {
        name: "module_id",
        label: "Module id",
        placeholder: "e.g. modulr.core",
        required: true,
      },
      {
        name: "state_phase",
        label: "State",
        placeholder: "",
        required: true,
        options: [
          { value: "running", label: "running" },
          { value: "syncing", label: "syncing" },
          { value: "degraded", label: "degraded" },
          { value: "maintenance", label: "maintenance" },
        ],
      },
      {
        name: "detail",
        label: "Detail (optional)",
        placeholder: "e.g. caught up through epoch 1284",
        required: false,
        multiline: true,
      },
    ],
  },
  {
    id: "get_module_state",
    title: "get_module_state",
    summary: "Fetch the last state snapshot Core has for a module (from recent report_module_state calls).",
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
    id: "store_module_code",
    title: "store_module_code",
    summary:
      "Publish methods / surface area for discovery — what this module exposes so Core and clients can wire calls.",
    params: [
      {
        name: "module_id",
        label: "Module id",
        placeholder: "e.g. modulr.assets",
        required: true,
      },
      {
        name: "exposed_operations",
        label: "Exposed operations",
        placeholder: "Comma-separated, e.g. transfer, balance, list_collections",
        required: true,
      },
      {
        name: "manifest_notes",
        label: "Manifest notes (optional)",
        placeholder: "Optional extra discovery hints, semver, feature flags…",
        required: false,
        multiline: true,
      },
    ],
  },
  {
    id: "register_module",
    title: "register_module",
    summary: "Publish a module declaration (bootstrap / authorized senders in production).",
    params: [
      {
        name: "module_name",
        label: "Module name",
        placeholder: "e.g. modulr.assets",
        required: true,
      },
      {
        name: "version",
        label: "Version",
        placeholder: "e.g. 1.0.0",
        required: false,
      },
    ],
  },
  {
    id: "register_org",
    title: "register_org",
    summary: "Claim an organization key under Core policy.",
    params: [
      {
        name: "organization_key",
        label: "Organization key",
        placeholder: "e.g. labs.acme",
        required: true,
      },
    ],
  },
  {
    id: "register_name",
    title: "register_name",
    summary: "Reserve a human-facing handle bound to an identity.",
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
    params: [
      {
        name: "module_id",
        label: "Module id",
        placeholder: "e.g. modulr.core",
        required: true,
      },
      {
        name: "note",
        label: "Note (optional)",
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

/** Operations we show for modulr.core in get_module_functions mock — kept in sync with this catalog. */
const CORE_OPERATION_NAMES = [
  "get_protocol_version",
  "lookup_module",
  "get_module_functions",
  "submit_module_route",
  "get_module_route",
  "report_module_state",
  "get_module_state",
  "store_module_code",
  "register_module",
  "register_org",
  "register_name",
  "resolve_name",
  "reverse_resolve_name",
  "heartbeat_update",
] as const;

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
    case "get_module_functions": {
      const mid = payload.module_id?.trim() || "modulr.core";
      const base =
        mid.toLowerCase() === "modulr.core"
          ? [...CORE_OPERATION_NAMES]
          : ["ping", "query_state", "submit_batch", "stream_events"];
      return {
        status: "ok",
        module_id: mid,
        operations: base,
        operation_count: base.length,
        request_id: `req_${(seed >>> 0).toString(16).slice(0, 12)}`,
      };
    }
    case "submit_module_route":
      return {
        status: "accepted_mock",
        module_id: payload.module_id?.trim(),
        route_type: payload.route_type?.trim() || "ip",
        route: payload.route?.trim(),
        mode: payload.mode?.trim() || "replace_all",
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
    case "report_module_state":
      return {
        status: "accepted_mock",
        module_id: payload.module_id?.trim(),
        state_phase: payload.state_phase?.trim(),
        detail: payload.detail?.trim() || null,
        recorded_at: now,
      };
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
    case "store_module_code": {
      const ops = (payload.exposed_operations ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        status: "accepted_mock",
        module_id: payload.module_id?.trim(),
        discovery_operations: ops,
        operation_count: ops.length,
        manifest_notes: payload.manifest_notes?.trim() || null,
        bytes_indexed_hint: 1200 + (seed % 8000),
        message: "Core would index this manifest for discovery UIs and dependency tracing.",
      };
    }
    case "register_module":
      return {
        status: "accepted_mock",
        module_name: payload.module_name?.trim(),
        version: payload.version?.trim() || "0.0.0",
        registration_id: `reg_${(seed >>> 0).toString(16)}`,
        message: "Would enqueue signed envelope validation in production.",
      };
    case "register_org":
      return {
        status: "accepted_mock",
        organization_key: payload.organization_key?.trim(),
        anchor_usd_floor_next: 100 * Math.pow(2, seed % 4),
        registration_id: `org_${(seed >>> 0).toString(16)}`,
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
    default:
      return { status: "unknown_operation", operation };
  }
}

import { buildSignedMessageBody } from "@/lib/modulrWire/signCoreMessage";

import { primaryCoreBaseUrl } from "./coreBaseUrl";

/** Parsed body of Core **GET /version** (not a `POST /message` operation). */
export type CoreVersionJson = {
  target_module: string;
  version: string;
  /** Present on current Core: `local` | `testnet` | `production`. */
  network_environment?: string;
  /** Resolved display label (custom `network_name` in TOML or tier default). */
  network_name?: string;
  genesis_operations_allowed?: boolean;
  /** When present, whether first-boot genesis wizard has finished (Core DB). */
  genesis_complete?: boolean;
};

export async function fetchCoreVersion(baseUrl: string): Promise<CoreVersionJson> {
  const base = primaryCoreBaseUrl([baseUrl]);
  if (!base) {
    throw new Error("Core base URL is empty");
  }
  const res = await fetch(`${base}/version`, { method: "GET" });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Core returned non-JSON (${res.status})`);
  }
  if (!res.ok) {
    const d = data as { detail?: string };
    throw new Error(d.detail ?? `HTTP ${res.status}`);
  }
  const o = data as Record<string, unknown>;
  const version = o.version;
  const target_module = o.target_module;
  if (typeof version !== "string" || typeof target_module !== "string") {
    throw new Error("Invalid /version response shape");
  }
  const network_environment =
    typeof o.network_environment === "string" ? o.network_environment : undefined;
  const network_name = typeof o.network_name === "string" ? o.network_name : undefined;
  const genesis_operations_allowed =
    typeof o.genesis_operations_allowed === "boolean"
      ? o.genesis_operations_allowed
      : undefined;
  const genesis_complete =
    typeof o.genesis_complete === "boolean" ? o.genesis_complete : undefined;
  return {
    version,
    target_module,
    network_environment,
    network_name,
    genesis_operations_allowed,
    genesis_complete,
  };
}

function errFromEnvelope(data: Record<string, unknown>, status: number): string {
  const detail = data.detail;
  if (typeof detail === "string" && detail) return detail;
  const code = data.code;
  if (typeof code === "string" && code) return `${code} (HTTP ${status})`;
  return `HTTP ${status}`;
}

/**
 * Signed `POST /message` using the same canonical JSON + Ed25519 rules as the dev playground.
 */
export type SignedPostOptions = {
  /** When set, signs with this Ed25519 seed instead of a random dev key. */
  ed25519SeedHex?: string;
};

export async function postSignedCoreOperation(
  baseUrl: string,
  protocolVersion: string,
  operation: string,
  payload: Record<string, unknown>,
  opts?: SignedPostOptions,
): Promise<Record<string, unknown>> {
  const base = primaryCoreBaseUrl([baseUrl]);
  if (!base) {
    throw new Error("Core base URL is empty");
  }
  const body = await buildSignedMessageBody({
    protocolVersion,
    operation,
    payload,
    ed25519SeedHex: opts?.ed25519SeedHex,
  });
  const res = await fetch(`${base}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Core returned non-JSON (${res.status})`);
  }
  const status = data.status;
  if (status === "error" || !res.ok) {
    throw new Error(errFromEnvelope(data, res.status));
  }
  return data;
}

/** Fetch wire `protocol_version` then run a signed `POST /message` (shared by live Methods). */
export async function executeSignedCoreOperation(
  baseUrl: string,
  operation: string,
  payload: Record<string, unknown>,
  opts?: SignedPostOptions,
): Promise<Record<string, unknown>> {
  const { version } = await fetchCoreVersion(baseUrl);
  return postSignedCoreOperation(baseUrl, version, operation, payload, opts);
}

export async function executeGetProtocolVersion(baseUrl: string): Promise<Record<string, unknown>> {
  return executeSignedCoreOperation(baseUrl, "get_protocol_version", {});
}

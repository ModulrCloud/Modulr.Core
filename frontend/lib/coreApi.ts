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

/** Success payload from `POST /genesis/challenge` (unsigned envelope). */
export type GenesisChallengeIssuedPayload = {
  challenge_id: string;
  challenge_body: string;
  issued_at_unix: number;
  expires_at_unix: number;
};

function parseGenesisUnsignedSuccess(
  data: Record<string, unknown>,
  httpOk: boolean,
): Record<string, unknown> {
  if (data.status !== "success" || !httpOk) {
    const detail = typeof data.detail === "string" && data.detail ? data.detail : "Request failed";
    throw new Error(detail);
  }
  const payload = data.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid Core response: missing payload");
  }
  return payload as Record<string, unknown>;
}

/**
 * Issue a genesis challenge bound to the operator Ed25519 public key (unsigned JSON).
 */
export async function postGenesisChallenge(
  baseUrl: string,
  subject_signing_pubkey_hex: string,
): Promise<GenesisChallengeIssuedPayload> {
  const base = primaryCoreBaseUrl([baseUrl]);
  if (!base) {
    throw new Error("Core base URL is empty");
  }
  const res = await fetch(`${base}/genesis/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject_signing_pubkey_hex }),
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Core returned non-JSON (${res.status})`);
  }
  const payload = parseGenesisUnsignedSuccess(data, res.ok);
  const challenge_id = payload.challenge_id;
  const challenge_body = payload.challenge_body;
  const issued_at_unix = payload.issued_at_unix;
  const expires_at_unix = payload.expires_at_unix;
  if (
    typeof challenge_id !== "string" ||
    typeof challenge_body !== "string" ||
    typeof issued_at_unix !== "number" ||
    typeof expires_at_unix !== "number"
  ) {
    throw new Error("Invalid genesis challenge response shape");
  }
  return { challenge_id, challenge_body, issued_at_unix, expires_at_unix };
}

/**
 * Verify Ed25519 signature over the challenge body and consume the challenge (one shot).
 */
export async function postGenesisChallengeVerify(
  baseUrl: string,
  challenge_id: string,
  signature_hex: string,
): Promise<void> {
  const base = primaryCoreBaseUrl([baseUrl]);
  if (!base) {
    throw new Error("Core base URL is empty");
  }
  const res = await fetch(`${base}/genesis/challenge/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge_id, signature_hex }),
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Core returned non-JSON (${res.status})`);
  }
  parseGenesisUnsignedSuccess(data, res.ok);
}

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

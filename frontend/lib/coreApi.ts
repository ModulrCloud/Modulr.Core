import { buildSignedMessageBody } from "@/lib/modulrWire/signCoreMessage";

import { primaryCoreBaseUrl } from "./coreBaseUrl";

export type CoreVersionJson = {
  target_module: string;
  version: string;
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
  return { version, target_module };
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
export async function postSignedCoreOperation(
  baseUrl: string,
  protocolVersion: string,
  operation: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const base = primaryCoreBaseUrl([baseUrl]);
  if (!base) {
    throw new Error("Core base URL is empty");
  }
  const body = await buildSignedMessageBody({
    protocolVersion,
    operation,
    payload,
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
): Promise<Record<string, unknown>> {
  const { version } = await fetchCoreVersion(baseUrl);
  return postSignedCoreOperation(baseUrl, version, operation, payload);
}

export async function executeGetProtocolVersion(baseUrl: string): Promise<Record<string, unknown>> {
  return executeSignedCoreOperation(baseUrl, "get_protocol_version", {});
}

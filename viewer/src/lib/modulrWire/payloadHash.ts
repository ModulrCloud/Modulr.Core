import { sha256 } from "@noble/hashes/sha256";

import { canonicalJsonStr } from "./canonicalJson";

/** Hex SHA-256 of UTF-8 text (pure `@noble/hashes`, works without `crypto.subtle`). */
export async function sha256HexUtf8(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = sha256(buf);
  return [...hash]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function payloadHash(payload: Record<string, unknown>): Promise<string> {
  return sha256HexUtf8(canonicalJsonStr(payload));
}

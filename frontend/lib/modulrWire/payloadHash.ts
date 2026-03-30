import { canonicalJsonStr } from "./canonicalJson";

export async function sha256HexUtf8(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function payloadHash(payload: Record<string, unknown>): Promise<string> {
  return sha256HexUtf8(canonicalJsonStr(payload));
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Parse exactly 32 bytes from 64 hex chars (optional `0x` prefix). */
export function hexToBytes32(hex: string): Uint8Array {
  const s = hex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(s)) {
    throw new Error("Expected 64 hex characters (32 bytes) for an Ed25519 seed");
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

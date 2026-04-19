/**
 * `@noble/ed25519` async APIs use `crypto.subtle` for SHA-512 by default. That API is
 * only available in a **secure context** (`https://`, or `http://localhost` /
 * `http://127.0.0.1`). Opening the Next dev app via a **LAN IP** on plain HTTP
 * (`http://10.x.x.x:3000`) is *not* secure, so `crypto.subtle` is missing and
 * signing would throw (`etc.sha512Async or crypto.subtle must be defined`).
 *
 * Import this module once before `signAsync` / `getPublicKeyAsync` so SHA-512
 * falls back to `@noble/hashes` when needed.
 */
import { sha512 } from "@noble/hashes/sha512";
import { etc } from "@noble/ed25519";

function webCryptoSubtleAvailable(): boolean {
  try {
    const c = globalThis.crypto;
    return (
      c != null && typeof c.subtle !== "undefined" && c.subtle != null
    );
  } catch {
    return false;
  }
}

if (!webCryptoSubtleAvailable()) {
  const fallback = (...messages: Uint8Array[]) =>
    sha512(etc.concatBytes(...messages));
  etc.sha512Sync = fallback;
  etc.sha512Async = async (...messages: Uint8Array[]) => fallback(...messages);
}

import "./nobleSubtleFallback";

import { getPublicKeyAsync, signAsync, utils } from "@noble/ed25519";

import { bytesToHex, hexToBytes32 } from "./bytes";
import { canonicalJsonStr } from "./canonicalJson";
import { payloadHash } from "./payloadHash";
import { randomUuidV4 } from "./randomUuid";

export type SignCoreMessageOpts = {
  protocolVersion: string;
  operation: string;
  payload: Record<string, unknown>;
  senderId?: string;
  /**
   * 64-char hex Ed25519 seed. When set, signs with this key (e.g. report_module_state
   * must match the module’s registered public key). Otherwise a random dev key.
   */
  ed25519SeedHex?: string;
};

/**
 * Build a UTF-8 JSON body for `POST /message`: signed envelope without `signature`,
 * then canonical JSON of the full object including hex signature.
 */
export async function buildSignedMessageBody(opts: SignCoreMessageOpts): Promise<string> {
  const seed = opts.ed25519SeedHex?.trim();
  const priv = seed ? hexToBytes32(seed) : utils.randomPrivateKey();
  const pub = await getPublicKeyAsync(priv);
  const pubHex = bytesToHex(pub);
  const messageId = randomUuidV4();
  const now = Date.now() / 1000;
  const payload = opts.payload;
  const ph = await payloadHash(payload);

  const envelope: Record<string, unknown> = {
    protocol_version: opts.protocolVersion,
    message_id: messageId,
    target_module: "modulr.core",
    operation: opts.operation,
    sender_id: opts.senderId ?? "user:customer-ui",
    sender_key_type: "ed25519",
    sender_public_key: pubHex,
    timestamp: now - 1,
    expires_at: now + 600,
    payload,
    payload_hash: ph,
    signature_algorithm: "ed25519",
  };

  const preimage = new TextEncoder().encode(canonicalJsonStr(envelope));
  const sig = await signAsync(preimage, priv);
  envelope.signature = bytesToHex(sig);
  return canonicalJsonStr(envelope);
}

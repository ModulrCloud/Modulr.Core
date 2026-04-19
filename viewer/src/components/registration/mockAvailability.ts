import { hashString } from "@/components/dashboard/mockModuleMetrics";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Simulated Core round-trip; deterministic per key for demos. */
export async function mockCheckRegistrationKeyAvailable(
  kind: "name" | "org",
  key: string,
): Promise<boolean> {
  const jitter = 380 + (hashString(`${kind}:${key}`) % 420);
  await delay(jitter);
  const h = hashString(`avail:${kind}:${key}`);
  return h % 11 !== 0;
}

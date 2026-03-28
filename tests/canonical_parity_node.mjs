/**
 * Node entrypoints for pytest canonical JSON parity (stdin JSON, stdout text/JSON).
 */
import { readFileSync } from "node:fs";
import { canonicalJsonStr } from "../src/modulr_core/http/static/playground/canonical_json.mjs";

const cmd = process.argv[2];

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

if (cmd === "canonical") {
  const raw = await readStdin();
  process.stdout.write(canonicalJsonStr(JSON.parse(raw)));
} else if (cmd === "negzero") {
  process.stdout.write(canonicalJsonStr({ x: -0 }));
} else if (cmd === "batch") {
  const raw = await readStdin();
  const cases = JSON.parse(raw);
  const outs = cases.map((c) => canonicalJsonStr(c));
  process.stdout.write(JSON.stringify(outs));
} else if (cmd === "batch-canonical") {
  /** stdin: JSON array of JSON texts (Python ``canonical_json_str`` output each). */
  const raw = await readStdin();
  const texts = JSON.parse(raw);
  const outs = texts.map((s) => canonicalJsonStr(JSON.parse(s)));
  process.stdout.write(JSON.stringify(outs));
} else if (cmd === "vectors-file") {
  const path = process.argv[3];
  if (!path) {
    console.error("usage: vectors-file <path.json>");
    process.exit(2);
  }
  const vectors = JSON.parse(readFileSync(path, "utf8"));
  const out = vectors.map(({ id, value }) => ({
    id,
    canonical: canonicalJsonStr(value),
  }));
  process.stdout.write(JSON.stringify(out));
} else {
  console.error(
    "usage: canonical | negzero | batch (stdin) | batch-canonical (stdin) | vectors-file <path>",
  );
  process.exit(2);
}

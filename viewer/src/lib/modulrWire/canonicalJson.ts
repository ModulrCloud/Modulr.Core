/**
 * Canonical JSON matching Python `modulr_core.validation.canonical.canonical_json_str`.
 */

function compareUnicodeKeys(a: string, b: string): number {
  const ac = Array.from(a, (ch) => ch.codePointAt(0) ?? 0);
  const bc = Array.from(b, (ch) => ch.codePointAt(0) ?? 0);
  const len = Math.min(ac.length, bc.length);
  for (let i = 0; i < len; i++) {
    if (ac[i] !== bc[i]) return ac[i]! - bc[i]!;
  }
  return ac.length - bc.length;
}

function serializeJsonString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    switch (cp) {
      case 0x22:
        out += '\\"';
        break;
      case 0x5c:
        out += "\\\\";
        break;
      case 0x08:
        out += "\\b";
        break;
      case 0x09:
        out += "\\t";
        break;
      case 0x0a:
        out += "\\n";
        break;
      case 0x0c:
        out += "\\f";
        break;
      case 0x0d:
        out += "\\r";
        break;
      default:
        if (cp < 0x20) {
          out += `\\u${cp.toString(16).padStart(4, "0")}`;
        } else {
          out += ch;
        }
    }
  }
  out += '"';
  return out;
}

function formatExponentialPython(n: number): string {
  let s = n.toExponential();
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  s = s.replace(/e([+-])(\d+)$/i, (_, sign: string, dig: string) => {
    const digits = dig.length === 1 ? `0${dig}` : dig;
    const sgn = sign === "-" ? "-" : "+";
    return `e${sgn}${digits}`;
  });
  return neg ? `-${s}` : s;
}

function serializeJsonNumber(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error("NaN/Infinity not allowed in JSON (Python allow_nan=False)");
  }
  if (Object.is(n, -0)) {
    return "-0.0";
  }

  const absN = Math.abs(n);

  if (Number.isInteger(n) && absN <= Number.MAX_SAFE_INTEGER) {
    return String(n);
  }

  if (Number.isInteger(n) && absN > Number.MAX_SAFE_INTEGER) {
    return formatExponentialPython(n);
  }

  const x = absN;
  if (x !== 0 && (x >= 1e16 || x < 1e-4)) {
    return formatExponentialPython(n);
  }

  return JSON.stringify(n);
}

function serializeJsonValue(v: unknown): string {
  if (v === null) {
    return "null";
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  if (typeof v === "number") {
    return serializeJsonNumber(v);
  }
  if (typeof v === "string") {
    return serializeJsonString(v);
  }
  if (Array.isArray(v)) {
    return `[${v.map(serializeJsonValue).join(",")}]`;
  }
  if (typeof v === "object") {
    const keys = Object.keys(v as object).sort(compareUnicodeKeys);
    return `{${keys.map((k) => `${serializeJsonString(k)}:${serializeJsonValue((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  throw new Error("Unsupported JSON value type for canonical serialization");
}

export function canonicalJsonStr(value: unknown): string {
  return serializeJsonValue(value);
}

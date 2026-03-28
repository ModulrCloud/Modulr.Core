/**
 * Dev playground: canonical JSON + Ed25519 must match modulr_core.validation.
 *
 * Ed25519 is bundled under ./vendor/ (same origin) so signing works without CDN.
 * Falls back to esm.sh only if the local module fails to load.
 */

import { canonicalJsonStr } from "./canonical_json.mjs";

const NOBLE_VENDOR = new URL("./vendor/noble-ed25519.bundle.mjs", import.meta.url)
  .href;
const NOBLE_CDN_FALLBACK =
  "https://esm.sh/@noble/ed25519@2.2.3/es2022/ed25519.bundle.mjs";

/** @type {Promise<typeof import("@noble/ed25519")> | null} */
let _noblePromise = null;

function loadNoble() {
  if (!_noblePromise) {
    _noblePromise = (async () => {
      try {
        return await import(NOBLE_VENDOR);
      } catch (err) {
        console.warn("modulr playground: local Ed25519 bundle failed", err);
        return await import(NOBLE_CDN_FALLBACK);
      }
    })();
  }
  return _noblePromise;
}

let protocolVersion = "2026.3.22.0";

async function sha256HexUtf8(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function payloadHash(payload) {
  return sha256HexUtf8(canonicalJsonStr(payload));
}

function hexToBytes(hex) {
  const s = hex.trim();
  if (s.length % 2 !== 0) throw new Error("Invalid hex length");
  return Uint8Array.from(s.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
}

function bytesToHex(u8) {
  return [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function apiBase() {
  const raw = document.getElementById("baseUrl").value.trim();
  return raw.replace(/\/$/, "");
}

function fieldHtml(id, label, value = "", placeholder = "") {
  const v = String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  const ph = String(placeholder)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
  return `<label for="${id}">${label}</label><input id="${id}" type="text" value="${v}" placeholder="${ph}" />`;
}

function fieldTextarea(id, label, value = "", placeholder = "") {
  const v = String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");
  const ph = String(placeholder)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");
  return `<label for="${id}">${label}</label><textarea id="${id}" spellcheck="false" placeholder="${ph}">${v}</textarea>`;
}

function opIntro(html) {
  return `<p class="field-intro">${html}</p>`;
}

function renderFields() {
  const op = document.getElementById("operation").value;
  const el = document.getElementById("fields");
  const mv = protocolVersion;
  const templates = {
    register_module: `
      ${opIntro("<strong>Required:</strong> module name, version, route JSON, and signing key (or use derived key).")}
      ${fieldHtml("f_module_name", "module_name", "modulr.playground", "e.g. modulr.storage")}
      ${fieldHtml("f_module_version", "module_version", mv, "protocol / module version string")}
      ${fieldTextarea("f_route", "route (JSON object)", '{"base_url":"https://example.invalid"}', '{"base_url":"..."}')}
      <label class="checkbox-label"><input type="checkbox" id="f_use_derived_signing" checked /> Use signing_public_key derived from private key (above)</label>
      ${fieldHtml("f_signing_pk", "signing_public_key (hex, 32 bytes)", "", "only if checkbox is off")}
    `,
    lookup_module: `
      ${opIntro("<strong>Required:</strong> registered module name to look up.")}
      ${fieldHtml("f_lookup_module", "module_name", "modulr.playground", "dotted module name")}
    `,
    register_name: `
      ${opIntro("<strong>Required:</strong> <code>name</code> (e.g. <code>@user</code>, <code>user@domain.net</code>, or <code>domain.net</code>) and <code>resolved_id</code>. Optional route / metadata JSON.")}
      ${fieldHtml("f_reg_name", "name", "user@modulr.network", "handle or scoped name")}
      ${fieldHtml("f_resolved_id", "resolved_id", "user:alice", "opaque identity id")}
      ${fieldTextarea("f_rn_route", "route (JSON, optional)", "", "{}")}
      ${fieldTextarea("f_rn_meta", "metadata (JSON, optional)", "", "{}")}
    `,
    register_org: `
      ${opIntro("<strong>Required:</strong> <code>organization_name</code> — dotted domain only (no @), e.g. <code>acme.network</code>. Same <code>resolved_id</code> as users under that org if you want them linked.")}
      ${fieldHtml("f_org_name", "organization_name", "modulr.network", "dotted domain, not user@domain")}
      ${fieldHtml("f_org_resolved", "resolved_id", "org:1", "e.g. org:…")}
      ${fieldTextarea("f_ro_route", "route (JSON, optional)", "", "{}")}
      ${fieldTextarea("f_ro_meta", "metadata (JSON, optional)", "", "{}")}
    `,
    resolve_name: `
      ${opIntro("<strong>Required:</strong> name to resolve (must match a registered binding).")}
      ${fieldHtml("f_resolve_name", "name", "user@modulr.network", "")}
    `,
    reverse_resolve_name: `
      ${opIntro("<strong>Required:</strong> <code>resolved_id</code> to list all names bound to that identity.")}
      ${fieldHtml("f_rev_id", "resolved_id", "user:alice", "")}
    `,
    heartbeat_update: `
      ${opIntro("<strong>Required:</strong> module must already be registered; signer must match module <code>signing_public_key</code>.")}
      ${fieldHtml("f_hb_module", "module_name", "modulr.storage", "")}
      ${fieldHtml("f_hb_version", "module_version", mv, "")}
      ${fieldHtml("f_hb_status", "status", "ok", "e.g. ok, degraded")}
      ${fieldTextarea("f_hb_route", "route (JSON, optional)", "", "{}")}
      ${fieldTextarea("f_hb_metrics", "metrics (JSON, optional)", "", "{}")}
      ${fieldHtml("f_hb_last", "last_seen_at (optional)", "", "epoch seconds; empty = server time")}
    `,
  };
  el.innerHTML = templates[op] || "";
}

function parseJsonOrEmpty(text, optional) {
  const t = text.trim();
  if (!t) {
    if (optional) return undefined;
    throw new Error("Expected JSON");
  }
  return JSON.parse(t);
}

async function buildPayload(op) {
  const mv = protocolVersion;
  switch (op) {
    case "register_module": {
      const { getPublicKeyAsync } = await loadNoble();
      const route = parseJsonOrEmpty(
        document.getElementById("f_route").value,
        false,
      );
      let signing = document.getElementById("f_signing_pk").value.trim();
      if (document.getElementById("f_use_derived_signing").checked) {
        const priv = hexToBytes(document.getElementById("privHex").value);
        signing = bytesToHex(await getPublicKeyAsync(priv));
      } else if (!signing) {
        throw new Error("signing_public_key required when not using derived key");
      }
      return {
        module_name: document.getElementById("f_module_name").value.trim(),
        module_version: document.getElementById("f_module_version").value.trim(),
        route,
        signing_public_key: signing,
      };
    }
    case "lookup_module":
      return {
        module_name: document.getElementById("f_lookup_module").value.trim(),
      };
    case "register_name": {
      const routeEl = document.getElementById("f_rn_route");
      const metaEl = document.getElementById("f_rn_meta");
      const p = {
        name: document.getElementById("f_reg_name").value.trim(),
        resolved_id: document.getElementById("f_resolved_id").value.trim(),
      };
      if (routeEl.value.trim())
        p.route = parseJsonOrEmpty(routeEl.value, false);
      if (metaEl.value.trim())
        p.metadata = parseJsonOrEmpty(metaEl.value, false);
      return p;
    }
    case "register_org": {
      const routeEl = document.getElementById("f_ro_route");
      const metaEl = document.getElementById("f_ro_meta");
      const p = {
        organization_name: document.getElementById("f_org_name").value.trim(),
        resolved_id: document.getElementById("f_org_resolved").value.trim(),
      };
      if (routeEl.value.trim())
        p.route = parseJsonOrEmpty(routeEl.value, false);
      if (metaEl.value.trim())
        p.metadata = parseJsonOrEmpty(metaEl.value, false);
      return p;
    }
    case "resolve_name":
      return {
        name: document.getElementById("f_resolve_name").value.trim(),
      };
    case "reverse_resolve_name":
      return {
        resolved_id: document.getElementById("f_rev_id").value.trim(),
      };
    case "heartbeat_update": {
      const p = {
        module_name: document.getElementById("f_hb_module").value.trim(),
        module_version: document.getElementById("f_hb_version").value.trim(),
        status: document.getElementById("f_hb_status").value.trim(),
      };
      const r = document.getElementById("f_hb_route").value.trim();
      const m = document.getElementById("f_hb_metrics").value.trim();
      const ls = document.getElementById("f_hb_last").value.trim();
      if (r) p.route = parseJsonOrEmpty(r, false);
      if (m) p.metrics = parseJsonOrEmpty(m, false);
      if (ls) p.last_seen_at = Number(ls);
      return p;
    }
    default:
      throw new Error(`Unknown operation ${op}`);
  }
}

async function sendEnvelope() {
  const out = document.getElementById("out");
  out.textContent = "Loading crypto library…";
  let noble;
  try {
    noble = await loadNoble();
  } catch (e) {
    out.textContent = `Could not load Ed25519 (bundled or CDN fallback).\n\n${e}`;
    return;
  }
  const { signAsync, getPublicKeyAsync } = noble;

  out.textContent = "…";
  const op = document.getElementById("operation").value;
  const privHex = document.getElementById("privHex").value.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(privHex)) {
    out.textContent =
      "Error: private key must be 64 hex characters (32 bytes). Click “Generate new key” first.";
    return;
  }
  const priv = hexToBytes(privHex);
  const pub = await getPublicKeyAsync(priv);
  const pubHex = bytesToHex(pub);
  const senderId =
    document.getElementById("senderId").value.trim() || "user:playground";
  const payload = await buildPayload(op);
  const ph = await payloadHash(payload);
  const now = Date.now() / 1000;
  const env = {
    protocol_version: protocolVersion,
    message_id: crypto.randomUUID(),
    target_module: "modulr.core",
    operation: op,
    sender_id: senderId,
    sender_key_type: "ed25519",
    sender_public_key: pubHex,
    timestamp: now - 1,
    expires_at: now + 600,
    payload,
    payload_hash: ph,
    signature_algorithm: "ed25519",
  };
  const preimage = new TextEncoder().encode(canonicalJsonStr(env));
  const sig = await signAsync(preimage, priv);
  env.signature = bytesToHex(sig);
  const body = canonicalJsonStr(env);
  const base = apiBase();
  const url = `${base || ""}/message`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const text = await res.text();
  let display;
  try {
    display = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    display = text;
  }
  out.textContent = `HTTP ${res.status}\n\n${display}`;
}

async function loadProtocol() {
  try {
    const base = apiBase();
    const r = await fetch(`${base || ""}/playground/protocol-info`);
    if (r.ok) {
      const j = await r.json();
      protocolVersion = j.protocol_version || protocolVersion;
    }
  } catch {
    /* ignore */
  }
  document.getElementById("protoLine").textContent =
    `Protocol version (wire): ${protocolVersion}`;
}

function genKey() {
  const priv = new Uint8Array(32);
  crypto.getRandomValues(priv);
  const hex = bytesToHex(priv);
  const ta = document.getElementById("privHex");
  ta.value = hex;
  ta.focus();
  ta.select();
  const pubLine = document.getElementById("pubLine");
  pubLine.textContent = `✓ Generated new private key (${hex.length} hex chars). Ready to sign.`;
  pubLine.classList.add("key-status-ok");
}

async function showPub() {
  const pubLine = document.getElementById("pubLine");
  pubLine.classList.remove("key-status-ok");
  try {
    const noble = await loadNoble();
    const { getPublicKeyAsync } = noble;
    const privHex = document.getElementById("privHex").value.trim();
    const priv = hexToBytes(privHex);
    const pub = await getPublicKeyAsync(priv);
    pubLine.textContent = `Derived public key (hex): ${bytesToHex(pub)}`;
  } catch (e) {
    pubLine.textContent = `Could not load Ed25519 library or invalid key: ${e}`;
  }
}

function initTheme() {
  const saved = localStorage.getItem("modulr-playground-theme");
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme =
    saved === "light" || saved === "dark"
      ? saved
      : prefersDark
        ? "dark"
        : "light";
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("btnTheme");
  if (btn) btn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("modulr-playground-theme", next);
  const btn = document.getElementById("btnTheme");
  if (btn) btn.textContent = next === "dark" ? "Light mode" : "Dark mode";
}

document.getElementById("operation").addEventListener("change", renderFields);
document.getElementById("btnSend").addEventListener("click", () => {
  sendEnvelope().catch((e) => {
    document.getElementById("out").textContent = String(e);
  });
});
document.getElementById("btnGenKey").addEventListener("click", genKey);
document.getElementById("btnFillPub").addEventListener("click", () => {
  showPub().catch((e) => {
    document.getElementById("pubLine").textContent = String(e);
  });
});
const btnTheme = document.getElementById("btnTheme");
if (btnTheme) btnTheme.addEventListener("click", toggleTheme);

initTheme();
renderFields();
loadProtocol().then(() => renderFields());

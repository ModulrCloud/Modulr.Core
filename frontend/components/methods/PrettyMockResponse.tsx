"use client";

function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isWireMethodRow(v: unknown): v is Record<string, unknown> {
  if (!isRecord(v)) return false;
  return typeof v.method === "string";
}

/** Core ``get_module_methods`` / ``get_protocol_methods`` catalog shape (payload or flat mock). */
function isMethodCatalogPayload(o: unknown): o is Record<string, unknown> {
  if (!isRecord(o)) return false;
  if (!Array.isArray(o.methods)) return false;
  if (o.methods.length === 0) {
    return typeof o.catalog_schema_version === "number" || typeof o.method_count === "number";
  }
  return o.methods.every((m) => isWireMethodRow(m));
}

function isLiveSuccessEnvelope(data: Record<string, unknown>): boolean {
  return data.status === "success" && isRecord(data.payload);
}

function MethodCatalogBody({ payload }: { payload: Record<string, unknown> }) {
  const methods = Array.isArray(payload.methods) ? payload.methods : [];
  const moduleId = payload.module_id;
  const schema = payload.catalog_schema_version;
  const count = payload.method_count;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs text-[var(--modulr-text-muted)]">
        {typeof schema === "number" ? (
          <span>
            <span className="font-semibold text-[var(--modulr-text)]">catalog_schema_version</span>{" "}
            {schema}
          </span>
        ) : null}
        {typeof moduleId === "string" ? (
          <span>
            <span className="font-semibold text-[var(--modulr-text)]">module_id</span>{" "}
            <code className="rounded bg-[var(--modulr-page-bg)]/60 px-1 font-mono">{moduleId}</code>
          </span>
        ) : null}
        {typeof count === "number" ? (
          <span>
            <span className="font-semibold text-[var(--modulr-text)]">method_count</span> {count}
          </span>
        ) : null}
      </div>

      {methods.length === 0 ? (
        <p className="text-sm text-[var(--modulr-text-muted)]">No methods in this catalog.</p>
      ) : (
        <ul className="space-y-3">
          {methods.map((raw, i) => {
            if (!isWireMethodRow(raw)) {
              return (
                <li key={i} className="font-mono text-xs break-all text-[var(--modulr-text)]">
                  {formatScalar(raw)}
                </li>
              );
            }
            const m = raw;
            const protocol = m.protocol_surface === true;
            return (
              <li
                key={`${String(m.method)}-${i}`}
                className="rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/25 p-3 sm:p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <code className="font-mono text-sm font-semibold text-[var(--modulr-accent)]">
                    {String(m.method)}
                  </code>
                  <div className="flex flex-wrap gap-1.5">
                    {protocol ? (
                      <span className="rounded-full border border-[var(--modulr-accent)]/35 bg-[var(--modulr-accent)]/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--modulr-accent)]">
                        Protocol surface
                      </span>
                    ) : null}
                    {typeof m.category === "string" ? (
                      <span className="rounded-full border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-2 py-0.5 text-[10px] font-medium text-[var(--modulr-text-muted)]">
                        {m.category}
                      </span>
                    ) : null}
                    {typeof m.group === "string" ? (
                      <span className="rounded-full border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] px-2 py-0.5 text-[10px] font-medium text-[var(--modulr-text-muted)]">
                        {m.group}
                      </span>
                    ) : null}
                  </div>
                </div>
                {typeof m.summary === "string" ? (
                  <p className="mt-2 text-sm leading-relaxed text-[var(--modulr-text)]">{m.summary}</p>
                ) : null}
                {typeof m.description === "string" ? (
                  <p className="mt-2 text-xs leading-relaxed text-[var(--modulr-text-muted)]">
                    {m.description}
                  </p>
                ) : null}
                {typeof m.payload_contract === "string" ? (
                  <p className="mt-2 font-mono text-[10px] text-[var(--modulr-text-muted)]">
                    payload_contract: {m.payload_contract}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EnvelopeStrip({ data }: { data: Record<string, unknown> }) {
  const code = data.code;
  const detail = data.detail;
  const op = data.operation;
  return (
    <div className="mb-4 rounded-lg border border-[var(--modulr-accent)]/25 bg-[var(--modulr-accent)]/8 px-3 py-2 text-xs">
      <p className="font-semibold text-[var(--modulr-accent)]">Core success envelope</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[var(--modulr-text-muted)]">
        {typeof op === "string" ? (
          <span>
            operation: <code className="text-[var(--modulr-text)]">{op}</code>
          </span>
        ) : null}
        {typeof code === "string" ? (
          <span>
            code: <code className="text-[var(--modulr-text)]">{code}</code>
          </span>
        ) : null}
        {typeof detail === "string" ? <span className="max-w-prose">{detail}</span> : null}
      </div>
    </div>
  );
}

const BRANDING_VISUAL_OMIT_KEYS: ReadonlySet<string> = new Set([
  "logo_svg",
  "root_organization_logo_svg",
  "profile_image_base64",
  "operator_profile_image_base64",
]);

function extractBrandingVisuals(payload: Record<string, unknown>): {
  logoSvg: string | null;
  imageDataUrl: string | null;
} {
  const logoSvg =
    (typeof payload.logo_svg === "string" && payload.logo_svg.trim() !== ""
      ? payload.logo_svg
      : null) ??
    (typeof payload.root_organization_logo_svg === "string" &&
    payload.root_organization_logo_svg.trim() !== ""
      ? payload.root_organization_logo_svg
      : null);
  const b64 =
    (typeof payload.profile_image_base64 === "string" && payload.profile_image_base64.trim() !== ""
      ? payload.profile_image_base64
      : null) ??
    (typeof payload.operator_profile_image_base64 === "string" &&
    payload.operator_profile_image_base64.trim() !== ""
      ? payload.operator_profile_image_base64
      : null);
  const mimeRaw =
    (typeof payload.profile_image_mime === "string" && payload.profile_image_mime
      ? payload.profile_image_mime
      : null) ??
    (typeof payload.operator_profile_image_mime === "string" && payload.operator_profile_image_mime
      ? payload.operator_profile_image_mime
      : null);
  const mime = mimeRaw && mimeRaw.startsWith("image/") ? mimeRaw : null;
  const imageDataUrl = b64 && mime ? `data:${mime};base64,${b64}` : null;
  return { logoSvg, imageDataUrl };
}

function BrandingPayloadPreview({ payload }: { payload: Record<string, unknown> }) {
  const { logoSvg, imageDataUrl } = extractBrandingVisuals(payload);
  if (!logoSvg && !imageDataUrl) return null;
  return (
    <div className="mb-6 space-y-4 rounded-lg border border-[var(--modulr-accent)]/20 bg-[var(--modulr-page-bg)]/20 p-4">
      {logoSvg ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--modulr-text-muted)]">
            SVG logo preview
          </p>
          <div
            className="modulr-scrollbar mt-2 max-h-56 overflow-auto rounded-md border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/50 p-3 [&_svg]:max-h-48 [&_svg]:w-auto"
            dangerouslySetInnerHTML={{ __html: logoSvg }}
          />
        </div>
      ) : null}
      {imageDataUrl ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--modulr-text-muted)]">
            Raster image preview
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from wire payload */}
          <img
            src={imageDataUrl}
            alt="Profile or branding raster from payload"
            className="mt-2 max-h-56 max-w-full rounded-md border border-[var(--modulr-glass-border)] object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}

function GenericKeyValueList({
  data,
  omitKeys,
}: {
  data: Record<string, unknown>;
  omitKeys?: ReadonlySet<string>;
}) {
  const entries = Object.entries(data).filter(([k]) => !omitKeys?.has(k));
  return (
    <ul className="space-y-4">
      {entries.map(([key, value]) => (
        <li
          key={key}
          className="border-b border-[var(--modulr-glass-border)] pb-4 last:border-0 last:pb-0"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--modulr-text-muted)]">
            {key.replace(/_/g, " ")}
          </p>
          <div className="mt-2 min-w-0 text-sm text-[var(--modulr-text)]">
            {Array.isArray(value) ? (
              <ul className="space-y-1 border-l-2 border-[var(--modulr-accent)]/35 pl-3 font-mono text-xs">
                {value.map((item, i) => (
                  <li key={i} className="break-all">
                    {formatScalar(item)}
                  </li>
                ))}
              </ul>
            ) : typeof value === "object" && value !== null ? (
              <pre className="modulr-scrollbar overflow-x-auto rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/40 p-3 font-mono text-xs leading-relaxed">
                {JSON.stringify(value, null, 2)}
              </pre>
            ) : (
              <span className="break-all font-mono text-xs">{formatScalar(value)}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Renders Methods execute results: full Core envelopes, wire method catalogs, or generic JSON.
 */
export function PrettyMockResponse({ data }: { data: Record<string, unknown> }) {
  if (isLiveSuccessEnvelope(data)) {
    const payload = data.payload as Record<string, unknown>;
    const { logoSvg, imageDataUrl } = extractBrandingVisuals(payload);
    const brandingOmit = logoSvg || imageDataUrl ? BRANDING_VISUAL_OMIT_KEYS : undefined;
    return (
      <div>
        <EnvelopeStrip data={data} />
        {isMethodCatalogPayload(payload) ? (
          <MethodCatalogBody payload={payload} />
        ) : (
          <>
            <BrandingPayloadPreview payload={payload} />
            <GenericKeyValueList data={payload} omitKeys={brandingOmit} />
          </>
        )}
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-[var(--modulr-text-muted)]">
            Raw envelope (debug)
          </summary>
          <pre className="modulr-scrollbar mt-2 max-h-64 overflow-auto rounded-lg border border-[var(--modulr-glass-border)] bg-[var(--modulr-page-bg)]/40 p-3 font-mono text-[10px] leading-relaxed">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  if (isMethodCatalogPayload(data)) {
    return <MethodCatalogBody payload={data} />;
  }

  const { logoSvg, imageDataUrl } = extractBrandingVisuals(data);
  const brandingOmit = logoSvg || imageDataUrl ? BRANDING_VISUAL_OMIT_KEYS : undefined;
  return (
    <>
      <BrandingPayloadPreview payload={data} />
      <GenericKeyValueList data={data} omitKeys={brandingOmit} />
    </>
  );
}

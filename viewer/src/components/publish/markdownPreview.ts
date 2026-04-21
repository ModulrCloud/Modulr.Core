/** Minimal Markdown → HTML for local ToS preview (escape-first, no raw HTML passthrough). */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineBold(s: string): string {
  const parts = s.split(/\*\*/);
  return parts
    .map((part, i) => (i % 2 === 1 ? `<strong class="font-semibold text-[var(--modulr-text)]">${esc(part)}</strong>` : esc(part)))
    .join("");
}

/**
 * Renders a small Markdown subset: headings (#–###), lists (-), horizontal rules (---), paragraphs, **bold**.
 */
export function modulrMarkdownToPreviewHtml(md: string): string {
  if (!md.trim()) {
    return `<p class="text-sm text-[var(--modulr-text-muted)]">Nothing to preview yet.</p>`;
  }
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const chunks: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      chunks.push("</ul>");
      listOpen = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (line === "") {
      closeList();
      continue;
    }

    if (line === "---") {
      closeList();
      chunks.push(
        `<hr class="my-4 border-[var(--modulr-glass-border)]" />`,
      );
      continue;
    }

    if (line.startsWith("### ")) {
      closeList();
      chunks.push(
        `<h3 class="text-base font-bold text-[var(--modulr-accent)]">${inlineBold(line.slice(4))}</h3>`,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      chunks.push(
        `<h2 class="text-lg font-bold text-[var(--modulr-text)]">${inlineBold(line.slice(3))}</h2>`,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      chunks.push(
        `<h1 class="text-xl font-bold text-[var(--modulr-text)]">${inlineBold(line.slice(2))}</h1>`,
      );
      continue;
    }

    if (line.startsWith("- ")) {
      if (!listOpen) {
        chunks.push(`<ul class="my-2 list-disc space-y-1 pl-5 text-sm text-[var(--modulr-text)]">`);
        listOpen = true;
      }
      chunks.push(`<li>${inlineBold(line.slice(2))}</li>`);
      continue;
    }

    closeList();
    chunks.push(`<p class="my-2 text-sm leading-relaxed text-[var(--modulr-text)]">${inlineBold(line)}</p>`);
  }

  closeList();
  return chunks.join("");
}

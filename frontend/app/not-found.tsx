import Link from "next/link";

/** App Router 404 — keeps a normal layout/CSS path instead of only the generic compiler chunk. */
export default function NotFound() {
  return (
    <div className="modulr-text mx-auto max-w-lg p-8">
      <h1 className="font-modulr-display text-xl font-bold">Page not found</h1>
      <p className="modulr-text-muted mt-2 text-sm leading-relaxed">
        That URL is not part of this shell. Use the header nav or go home.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm font-semibold text-[var(--modulr-accent)] hover:underline"
      >
        ← Home
      </Link>
    </div>
  );
}

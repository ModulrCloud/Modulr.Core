import { Link } from "react-router-dom";

/** SPA 404 — same layout as the Next.js `app/not-found` page. */
export function NotFoundPage() {
  return (
    <div className="modulr-text mx-auto max-w-lg p-8">
      <h1 className="font-modulr-display text-xl font-bold">Page not found</h1>
      <p className="modulr-text-muted mt-2 text-sm leading-relaxed">
        That URL is not part of this shell. Use the header nav or go home.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block text-sm font-semibold text-[var(--modulr-accent)] hover:underline"
      >
        ← Home
      </Link>
    </div>
  );
}

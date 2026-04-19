import { useEffect } from "react";

import { useAppUi } from "@/components/providers/AppProviders";

type FeedItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  kind: "info" | "feature" | "network";
};

/** Placeholder feed — replace with Core / CMS-driven messages when wired. */
const PLACEHOLDER_FEED: FeedItem[] = [
  {
    id: "1",
    kind: "network",
    title: "Network status",
    body: "Modulr.Core coordination is available for your configured endpoints. Live incident banners will appear here.",
    time: "Now",
  },
  {
    id: "2",
    kind: "feature",
    title: "Welcome center",
    body: "The home page now focuses on sign-in and discovery. Operators can open Inspector for module metrics.",
    time: "Recently",
  },
  {
    id: "3",
    kind: "info",
    title: "Notifications",
    body: "We will use this panel for outages, upgrades, and product announcements — same placement across Modulr apps.",
    time: "Preview",
  },
];

export function NotificationsPanel() {
  const { notificationsOpen, setNotificationsOpen } = useAppUi();

  useEffect(() => {
    if (!notificationsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNotificationsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notificationsOpen, setNotificationsOpen]);

  return (
    <div
      className={`fixed inset-0 z-40 ${notificationsOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!notificationsOpen}
    >
      <button
        type="button"
        tabIndex={notificationsOpen ? 0 : -1}
        className={`absolute inset-0 cursor-default bg-black/25 transition-opacity duration-200 ${
          notificationsOpen ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Close notifications"
        onClick={() => setNotificationsOpen(false)}
      />
      <div
        className={`modulr-glass-surface absolute right-4 top-[4.5rem] z-50 w-[min(22rem,calc(100vw-2rem))] max-h-[min(70vh,520px)] overflow-hidden rounded-2xl border border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-fill)] shadow-2xl transition-[opacity,transform] duration-200 ease-out sm:right-8 ${
          notificationsOpen ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
        }`}
        style={{
          boxShadow:
            "0 24px 64px rgba(0,0,0,0.28), inset 0 1px 0 var(--modulr-glass-highlight)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-panel-title"
        inert={!notificationsOpen}
      >
        <div className="flex items-center justify-between border-b border-[var(--modulr-glass-border)] px-4 py-3 sm:px-5">
          <h2
            id="notifications-panel-title"
            className="font-modulr-display text-sm font-bold text-[var(--modulr-text)]"
          >
            Notifications
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs text-[var(--modulr-text-muted)] hover:bg-[var(--modulr-glass-highlight)] hover:text-[var(--modulr-text)]"
            onClick={() => setNotificationsOpen(false)}
          >
            Close
          </button>
        </div>
        <ul className="modulr-scrollbar max-h-[min(58vh,440px)] space-y-0 overflow-y-auto p-3 sm:p-4">
          {PLACEHOLDER_FEED.map((item, i) => (
            <li
              key={item.id}
              className={
                i > 0 ? "border-t border-[var(--modulr-glass-border)] pt-4 mt-4" : ""
              }
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--modulr-accent)]">
                {item.kind === "network"
                  ? "Network"
                  : item.kind === "feature"
                    ? "Product"
                    : "Info"}{" "}
                · {item.time}
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--modulr-text)]">{item.title}</p>
              <p className="modulr-text-muted mt-1 text-xs leading-relaxed">{item.body}</p>
            </li>
          ))}
        </ul>
        <div className="border-t border-[var(--modulr-glass-border)] px-4 py-3 sm:px-5">
          <p className="text-[10px] leading-snug text-[var(--modulr-text-muted)]">
            Live feeds will connect to Core and product services — this list is illustrative.
          </p>
        </div>
      </div>
    </div>
  );
}

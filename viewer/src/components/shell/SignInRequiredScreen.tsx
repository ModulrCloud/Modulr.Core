import { Link } from "react-router-dom";

import { GlassPanel } from "@/components/shell/GlassPanel";
import { routeToShellSignInSection } from "@/lib/shellDeepLinks";
import { setMockShellAuthKind, setShellSignedIn } from "@/lib/mockShellIdentity";

type SignInRequiredScreenProps = {
  title?: string;
  description?: string;
};

/**
 * Shown when Profile or Organizations require a mock wallet/session connection.
 */
export function SignInRequiredScreen({
  title = "Sign in required",
  description = "Connect a wallet or session to use this part of the shell. For now, use the demo control on the home dashboard or below.",
}: SignInRequiredScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <GlassPanel className="p-8 sm:p-10">
        <p className="font-modulr-display text-xs font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
          Session
        </p>
        <h1 className="font-modulr-display mt-3 text-2xl font-bold text-[var(--modulr-text)] sm:text-3xl">
          {title}
        </h1>
        <p className="modulr-text-muted mt-4 text-sm leading-relaxed">{description}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            to={routeToShellSignInSection}
            className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-[var(--modulr-accent)] px-8 text-sm font-bold text-[var(--modulr-accent-contrast)] shadow-[0_8px_28px_rgba(255,183,0,0.25)] transition-opacity hover:opacity-95"
          >
            Go to sign-in
          </Link>
          <button
            type="button"
            className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border-2 border-[var(--modulr-glass-border)] bg-[var(--modulr-glass-panel-fill)] px-8 text-sm font-bold text-[var(--modulr-text)] shadow-[inset_0_1px_0_var(--modulr-glass-highlight)] transition-colors hover:border-[var(--modulr-accent)]/40 hover:text-[var(--modulr-accent)]"
            onClick={() => {
              setMockShellAuthKind("wallet");
              setShellSignedIn(true);
            }}
          >
            Connect (demo)
          </button>
        </div>
        <p className="modulr-text-muted mt-6 text-xs leading-relaxed">
          Production will use Keymaster or a browser wallet; this only sets a local flag so you can
          preview the flow.
        </p>
      </GlassPanel>
    </div>
  );
}

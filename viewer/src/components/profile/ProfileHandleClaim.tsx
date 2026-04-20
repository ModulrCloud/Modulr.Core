"use client";

import { useCallback, useMemo, useState } from "react";

import { RegisterFormSection } from "@/components/registration/RegisterFormShared";
import { mockNamePriceQuote } from "@/components/registration/mockRegistrationPricing";
import { useMockAvailability } from "@/components/registration/useMockAvailability";
import {
  getMockNetworkHandle,
  notifyMockIdentityChanged,
  setMockNetworkHandle,
} from "@/lib/mockShellIdentity";

/**
 * Shown when the user has no mock handle yet — compact claim flow above the hero.
 */
export function ProfileHandleClaim() {
  const [storedHandle, setStoredHandle] = useState<string | null>(() => getMockNetworkHandle());
  const [nameInput, setNameInput] = useState("");
  const [submitNote, setSubmitNote] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setStoredHandle(getMockNetworkHandle());
  }, []);

  const nameQuote = useMemo(() => mockNamePriceQuote(nameInput), [nameInput]);
  const nameAvail = useMockAvailability(nameQuote.normalized, nameQuote.valid, "name", 1000);

  if (storedHandle) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[var(--modulr-accent)]/25 bg-[rgba(255,183,0,0.06)] px-6 py-5 sm:px-8">
        <p className="font-modulr-display text-xs font-bold uppercase tracking-widest text-[var(--modulr-accent)]">
          Next step
        </p>
        <h2 className="font-modulr-display mt-2 text-lg font-bold text-[var(--modulr-text)]">
          Claim your @handle
        </h2>
        <p className="modulr-text-muted mt-2 max-w-3xl text-sm leading-relaxed">
          Then set your photo and bio in the card below — same public profile the network will use for
          search and discovery.
        </p>
      </div>

      <RegisterFormSection
        idPrefix="profile-handle"
        title="Network handle"
        description="Pricing is tiered by grapheme count (1 → 2–3 → 4–5 → 6+). Emoji and international text are OK."
        label="Desired handle"
        placeholder="e.g. river-moss, 北, or 🌊"
        value={nameInput}
        onChange={(v) => {
          setNameInput(v);
          setSubmitNote(null);
        }}
        quote={nameQuote}
        previewVariant="name"
        availability={nameAvail}
        submitLabel="Continue (mock)"
        onMockSubmit={() => {
          const h = nameQuote.normalized;
          setMockNetworkHandle(h);
          setSubmitNote(`Handle “${h}” saved — customize your profile below.`);
          refresh();
          notifyMockIdentityChanged();
        }}
        submitNote={submitNote}
      />
    </section>
  );
}

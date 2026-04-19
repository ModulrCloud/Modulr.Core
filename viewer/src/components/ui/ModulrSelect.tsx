"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export type ModulrSelectOption = { value: string; label: string };

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ModulrSelectOption[];
  className?: string;
  /**
   * When the listbox is closed, Enter invokes this instead of opening the menu
   * (e.g. last parameter field → run execute).
   */
  onEnterWhenClosed?: () => void;
};

/**
 * Theme-aware listbox (replaces native `<select>` where the OS popup ignores dark mode).
 */
export function ModulrSelect({
  id,
  value,
  onChange,
  options,
  className = "",
  onEnterWhenClosed,
}: Props) {
  const uid = useId();
  const triggerId = id ?? `modulr-select-${uid}`;
  const listId = `${triggerId}-listbox`;

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return;
    setHighlight(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const commit = useCallback(
    (i: number) => {
      const o = options[i];
      if (o) onChange(o.value);
      setOpen(false);
      btnRef.current?.focus();
    },
    [onChange, options],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (!open) {
      if (e.key === "Enter" && onEnterWhenClosed) {
        e.preventDefault();
        onEnterWhenClosed();
        return;
      }
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(highlight);
    }
  }

  return (
    <div ref={rootRef} className={`relative w-full ${className}`.trim()}>
      <button
        ref={btnRef}
        type="button"
        id={triggerId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className="modulr-select-trigger"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selected?.label}
        </span>
        <span
          className="modulr-select-chevron shrink-0"
          aria-hidden
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={triggerId}
          className="modulr-select-list modulr-scrollbar"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={
                "modulr-select-option" +
                (i === highlight ? " modulr-select-option--hl" : "") +
                (o.value === value ? " modulr-select-option--selected" : "")
              }
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

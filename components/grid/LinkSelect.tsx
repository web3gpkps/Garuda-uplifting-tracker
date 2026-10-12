"use client";

import { useId, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Field";

export type LinkSelectOption = {
  /** Stable value, e.g. a station code or "semua". */
  value: string;
  /** "CGK (12 SDM)". */
  label: string;
  /** Internal path built with hrefs(access).to(...), never user input. */
  href: string;
};

type LinkSelectProps = {
  /** Visible label above the select, e.g. "Stasiun". */
  label: string;
  options: LinkSelectOption[];
  /** Value of the option shown now. */
  current: string;
  /**
   * RememberView records a station choice from a click on an element carrying
   * data-remember-stasiun; a select has no such click, so one is dispatched on change.
   */
  rememberStation?: boolean;
  className?: string;
};

/**
 * A filter that navigates: a native select whose options are real URLs (?stasiun=CGK),
 * so the choice survives a reload and scales to the ~22 Garuda stations where a row of
 * chips would not. Client component.
 */
export function LinkSelect({ label, options, current, rememberStation = false, className }: LinkSelectProps) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const marker = useRef<HTMLSpanElement>(null);

  function change(value: string) {
    const option = options.find((o) => o.value === value);
    if (!option) return;
    if (rememberStation && marker.current) {
      marker.current.dataset.rememberStasiun = value;
      marker.current.click();
    }
    startTransition(() => router.push(option.href, { scroll: false }));
  }

  return (
    <div className={className} data-print="hide">
      <label htmlFor={id} className="section-label mb-1.5 block">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span className="w-56 max-w-full">
          <Select id={id} value={current} onChange={(event) => change(event.target.value)} aria-busy={pending || undefined}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </span>
        {pending ? <span className="text-xs text-ink-muted">Memuat…</span> : null}
      </div>
      <span ref={marker} hidden aria-hidden="true" />
    </div>
  );
}

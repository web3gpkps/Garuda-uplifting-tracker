"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { Select } from "./Field";
import { cx } from "./cx";

export type StationFilterOption = {
  /** Station code, or null for "Semua stasiun". */
  code: string | null;
  label: string;
  /** Short extra text after the label, e.g. "2/5" dinilai or "26" SDM. */
  meta?: string;
  /** Spoken version of `meta`, e.g. "2 dari 5 sudah dinilai". */
  metaLabel?: string;
  href: string;
};

type StationFilterProps = {
  options: StationFilterOption[];
  current: string | null;
  /** Accessible name of the control when it should differ from the visible "Stasiun". */
  label?: string;
  className?: string;
};

/** Value of the "Semua stasiun" option (a station code is never lower case). */
const ALL = "semua";

function optionText(option: StationFilterOption): string {
  if (!option.meta) return option.label;
  return `${option.label} (${option.metaLabel ?? option.meta})`;
}

/**
 * The KPS station filter on every workspace screen. With about 22 stations a row of chips
 * would take several lines, so it is one native select: compact, searchable by typing the
 * code, and the phone's own picker on mobile. Choosing an option navigates to its href
 * (?stasiun=CGK), so the choice lives in the URL and survives a reload. Render it inside
 * the PageHeader, and only for KPS links and the owner (a station link sees one station).
 */
export function StationFilter({ options, current, label = "Filter stasiun", className }: StationFilterProps) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const value = current ?? ALL;

  return (
    <div className={cx("flex flex-col gap-1.5", className)} data-print="hide">
      <label htmlFor={id} className="section-label">
        Stasiun
      </label>
      <div className="flex items-center gap-3">
        <Select
          id={id}
          aria-label={label === "Filter stasiun" ? undefined : label}
          value={value}
          aria-busy={pending || undefined}
          data-remember-stasiun-select=""
          onChange={(event) => {
            const chosen = options.find((option) => (option.code ?? ALL) === event.target.value);
            if (!chosen) return;
            startTransition(() => router.push(chosen.href, { scroll: false }));
          }}
          className="w-full sm:w-72"
        >
          {options.map((option) => (
            <option key={option.code ?? ALL} value={option.code ?? ALL}>
              {optionText(option)}
            </option>
          ))}
        </Select>
        {pending ? (
          <span role="status" className="text-xs text-ink-muted">
            Memuat…
          </span>
        ) : null}
      </div>
    </div>
  );
}

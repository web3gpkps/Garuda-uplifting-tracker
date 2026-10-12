"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Field, Select } from "@/components/ui/Field";

export type FilterOption = { value: string; label: string };

type FilterKey = "program" | "status" | "stasiun";

type RemedialFiltersProps = {
  /** The Remedial sheet path for this access (hrefs(access).remedial). */
  path: string;
  current: Record<FilterKey, string | null>;
  programs: FilterOption[];
  statuses: FilterOption[];
  /** KPS / owner only; null hides the station select (a station link sees one station). */
  stations: FilterOption[] | null;
};

function hrefFor(path: string, values: Record<FilterKey, string | null>): string {
  const sp = new URLSearchParams();
  for (const key of ["program", "status", "stasiun"] as const) {
    const v = values[key];
    if (v) sp.set(key, v);
  }
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}

/**
 * Program, status and (KPS) station filters as selects: about 22 stations do not fit as
 * chips on a phone. Each choice replaces the URL (?program=&status=&stasiun=), so the view
 * survives a reload and can be shared.
 */
export function RemedialFilters({ path, current, programs, statuses, stations }: RemedialFiltersProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(key: FilterKey, value: string) {
    // "Semua stasiun" is sent as ?stasiun=semua, so the remembered station (RememberView) is not
    // put back over an explicit choice of every station.
    const empty = key === "stasiun" ? "semua" : null;
    const next = { ...current, [key]: value === "" ? empty : value };
    startTransition(() => router.replace(hrefFor(path, next), { scroll: false }));
  }

  return (
    <div
      role="group"
      aria-label="Filter daftar remedial"
      aria-busy={pending || undefined}
      className="grid gap-3 sm:grid-cols-3 sm:gap-4 lg:max-w-3xl"
      data-print="hide"
    >
      <Field label="Program">
        <Select value={current.program ?? ""} onChange={(e) => choose("program", e.target.value)}>
          <option value="">Semua program</option>
          {programs.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status remedial">
        <Select value={current.status ?? ""} onChange={(e) => choose("status", e.target.value)}>
          <option value="">Semua status</option>
          {statuses.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      {stations ? (
        <Field label="Stasiun">
          <Select
            value={current.stasiun && current.stasiun !== "semua" ? current.stasiun : ""}
            onChange={(e) => choose("stasiun", e.target.value)}
          >
            <option value="">Semua stasiun</option>
            {stations.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
    </div>
  );
}

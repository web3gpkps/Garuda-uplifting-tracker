/*
 * Plain data helpers for the URL-driven selects (UrlSelect, StationSelect, WeekSelect).
 * Not a client module, so server components can build options with them.
 */

export type UrlOption = {
  /** Stable value, e.g. a station code, "semua", or a week number as text. */
  value: string;
  /** Visible text, e.g. "CGK (12 SDM)" or "Minggu ke-2 · 12 Okt". */
  label: string;
  /** Internal path built with hrefs(access).to(...), never user input. */
  href: string;
};

/** Value of the "Semua stasiun" option (a station code is never lower case). */
export const ALL_STATIONS = "semua";

/** Builds 1..count options: numberedOptions(10, (n) => `Minggu ke-${n}`, (n) => links.to("performa", { minggu: n })). */
export function numberedOptions(count: number, label: (n: number) => string, href: (n: number) => string): UrlOption[] {
  return Array.from({ length: count }, (_, i) => ({ value: String(i + 1), label: label(i + 1), href: href(i + 1) }));
}


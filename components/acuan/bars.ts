/*
 * Widths for the CSS bars on the Acuan PDF screen. Pure.
 */

/** Bar width in percent of the track: value ÷ max, clamped to 0..100, rounded to 0.1. */
export function barWidth(value: number | null | undefined, max: number): number {
  if (value == null || !Number.isFinite(value) || max <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (value / max) * 100)) * 10) / 10;
}

/** Sum of the two programs, treating "not in the chart" (null) as 0. */
export function failedTotal(row: { iuls: number | null; rust: number | null }): number {
  return (row.iuls ?? 0) + (row.rust ?? 0);
}

/*
 * Vertical scale of the Laporan section D chart. Scores run 0..100 but sit mostly near the
 * passing grade, so the axis starts at the round ten below the lowest value (and below the
 * passing grade), and always ends at 100. Pure.
 */
export type TrendScale = { min: number; max: number; ticks: number[] };

export function trendScale(values: ReadonlyArray<number | null>, passGrade: number): TrendScale {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const lowest = Math.min(passGrade, ...present);
  const min = Math.max(0, Math.floor((lowest - 5) / 10) * 10);
  const max = 100;
  const step = max - min > 50 ? 20 : 10;
  const ticks: number[] = [];
  for (let t = max; t >= min; t -= step) ticks.push(t);
  if (ticks[ticks.length - 1] !== min) ticks.push(min);
  return { min, max, ticks: ticks.reverse() };
}

/*
 * Laporan section D as small multiples, one panel per program on one shared scale: the
 * program mean in --brand, the all-staff mean (SEMUA) as a dashed ink line, the passing
 * grade as a darker rule. The table under it carries every number.
 */
import type { TrendRow } from "@/lib/aggregate";
import { formatScore } from "@/lib/format";
import { trendScale, type TrendScale } from "./trend-scale";

const W = 300;
const H = 168;
const M = { top: 14, right: 40, bottom: 26, left: 28 };

function x(week: number, weeks: number): number {
  return M.left + ((week - 1) / Math.max(1, weeks - 1)) * (W - M.left - M.right);
}

function yOf(scale: TrendScale) {
  return (value: number) => M.top + ((scale.max - value) / (scale.max - scale.min)) * (H - M.top - M.bottom);
}

/** Polyline segments, broken where a week has no score. */
function segments(values: Array<number | null>, weeks: number, y: (v: number) => number): string[] {
  const out: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length > 1) out.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${x(i + 1, weeks).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (current.length > 1) out.push(current.join(" "));
  return out;
}

function describe(row: TrendRow): string {
  const points = row.weeks.map((v, i) => (v === null ? null : `Mg ${i + 1} ${formatScore(v)}`)).filter(Boolean);
  return points.length === 0
    ? `${row.key}: belum ada skor.`
    : `${row.key}, rata-rata skor coaching: ${points.join("; ")}.`;
}

export function TrendChart({
  rows,
  reference,
  passGrade,
}: {
  /** Program rows to draw, one panel each. */
  rows: TrendRow[];
  /** SEMUA row, drawn dashed in every panel. */
  reference: TrendRow | null;
  passGrade: number;
}) {
  const scale = trendScale([...rows, ...(reference ? [reference] : [])].flatMap((r) => r.weeks), passGrade);
  return (
    <div className="flex flex-col gap-3">
      <ul
        className={
          rows.length === 1
            ? "grid max-w-xl print:max-w-[50%]"
            : "grid gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-3"
        }
        aria-label="Grafik tren per program"
      >
        {rows.map((row) => (
          <li key={row.key} className="min-w-0 break-inside-avoid">
            <Panel row={row} reference={reference} passGrade={passGrade} scale={scale} />
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-2">
          <svg aria-hidden="true" width="24" height="8" className="shrink-0">
            <line x1="1" y1="4" x2="23" y2="4" className="stroke-brand" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Rata-rata program
        </span>
        {reference ? (
          <span className="inline-flex items-center gap-2">
            <svg aria-hidden="true" width="24" height="8" className="shrink-0">
              <line x1="1" y1="4" x2="23" y2="4" className="stroke-ink-muted" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            Rata-rata semua SDM (SEMUA)
          </span>
        ) : null}
        <span>
          Garis lebih gelap di {passGrade}: passing grade. Sumbu mulai dari {scale.min}. Minggu tanpa skor dilewati.
        </span>
      </p>
    </div>
  );
}

function Panel({
  row,
  reference,
  passGrade,
  scale,
}: {
  row: TrendRow;
  reference: TrendRow | null;
  passGrade: number;
  scale: TrendScale;
}) {
  const weeks = row.weeks.length;
  const y = yOf(scale);
  const last = row.weeks.reduce<number | null>((acc, v, i) => (v === null ? acc : i), null);
  const showPass = passGrade > scale.min && passGrade < scale.max;

  return (
    <figure className="rounded-control border border-line bg-surface p-2">
      <figcaption className="px-1 text-sm font-semibold text-ink">{row.key}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={describe(row)} className="block h-auto w-full">
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth="1" />
            <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[10px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {showPass ? (
          <line x1={M.left} x2={W - M.right} y1={y(passGrade)} y2={y(passGrade)} className="stroke-line-strong" strokeWidth="1.25" />
        ) : null}
        {Array.from({ length: weeks }, (_, i) => (
          <text key={i} x={x(i + 1, weeks)} y={H - 8} textAnchor="middle" className="fill-ink-muted text-[10px] tabular-nums">
            {i + 1}
          </text>
        ))}

        {reference
          ? segments(reference.weeks, weeks, y).map((points, i) => (
              <polyline
                key={`ref-${i}`}
                points={points}
                fill="none"
                className="stroke-ink-muted"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))
          : null}
        {reference
          ? reference.weeks.map((v, i) =>
              v === null ? null : <circle key={`ref-dot-${i}`} cx={x(i + 1, weeks)} cy={y(v)} r="2" className="fill-ink-muted" />,
            )
          : null}

        {segments(row.weeks, weeks, y).map((points, i) => (
          <polyline
            key={i}
            points={points}
            fill="none"
            className="stroke-brand"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {row.weeks.map((v, i) =>
          v === null ? null : (
            <circle key={i} cx={x(i + 1, weeks)} cy={y(v)} r="4" className="fill-brand stroke-surface" strokeWidth="2">
              <title>{`${row.key}, Minggu ke-${i + 1}: ${formatScore(v)}`}</title>
            </circle>
          ),
        )}

        {last !== null ? (
          <text
            x={x(last + 1, weeks) + 7}
            y={y(row.weeks[last]!)}
            dy="0.32em"
            className="fill-ink stroke-surface text-[10px] font-semibold tabular-nums [paint-order:stroke]"
            strokeWidth="3"
          >
            {formatScore(row.weeks[last]!)}
          </text>
        ) : null}
      </svg>
    </figure>
  );
}

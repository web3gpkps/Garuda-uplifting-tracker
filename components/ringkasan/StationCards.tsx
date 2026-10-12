import Link from "next/link";
import type { ReactNode } from "react";
import { formatPercent, type DashboardSummary, type StationComparisonRow } from "@/lib/dashboard";
import { formatScore, formatSignedScore } from "@/lib/format";
import type { SheetLinks } from "@/lib/workspace/access";
import { linkTo } from "@/components/dashboard/KpiTile";
import { Bar, Flagged, comparisonLabels } from "@/components/dashboard/StationComparison";

function Metric({ label, href, children }: { label: string; href: string; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-11 flex-col justify-center gap-1 px-4 py-2 transition-colors duration-120 hover:bg-paper"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink-muted">{label}</span>
          <span className="text-right text-sm text-ink tabular-nums">{children}</span>
        </span>
      </Link>
    </li>
  );
}

function Card({
  row,
  title,
  summary,
  links,
}: {
  row: StationComparisonRow;
  title: ReactNode;
  summary: DashboardSummary;
  links: SheetLinks;
}) {
  const labels = comparisonLabels(summary);
  const href = (l: StationComparisonRow["links"][keyof StationComparisonRow["links"]]) => linkTo(links, l);
  return (
    <li className="overflow-hidden rounded-control border border-line bg-surface">
      <h3 className="flex items-baseline justify-between gap-3 border-b border-line bg-paper px-4 py-2">
        <span className="text-base font-semibold text-ink">{title}</span>
        <span className="text-xs text-ink-muted">{row.staffCount} SDM</span>
      </h3>
      <ul className="flex flex-col divide-y divide-line">
        <Metric label={labels.week} href={href(row.links.performa)}>
          {row.assessed.value === null ? (
            <span className="text-ink-muted">{labels.notYet}</span>
          ) : (
            <>
              <span className="font-semibold">{row.assessed.value}</span> dari {row.assessed.total}
              <Bar value={row.assessed.value} total={row.assessed.total} className="mt-1 ml-auto" />
            </>
          )}
        </Metric>
        <Metric label="Skor terkini (baseline)" href={href(row.links.rekap)}>
          {row.score.current === null ? (
            <span className="text-ink-muted">Belum dinilai</span>
          ) : (
            <>
              <span className="font-semibold">{formatScore(row.score.current)}</span>{" "}
              <span className="text-ink-muted">
                ({formatScore(row.score.baseline) || "–"}
                {row.score.gain !== null ? `, ${formatSignedScore(row.score.gain)}` : ""})
              </span>
            </>
          )}
        </Metric>
        <Metric label={labels.bmi} href={href(row.links.bmi)}>
          {row.bmi.checkedThisPeriod === null ? (
            <span className="text-ink-muted">{labels.notYet}</span>
          ) : (
            <>
              <span className="font-semibold">{row.bmi.checkedThisPeriod}</span> dari {row.assessed.total}
            </>
          )}
        </Metric>
        <Metric label="Overweight + obesitas" href={href(row.links.bmi)}>
          {row.bmi.pctOverweight === null ? (
            <span className="text-ink-muted">Belum dicek</span>
          ) : (
            <>
              <span className="font-semibold">{formatPercent(row.bmi.pctOverweight, 0)}</span> ({row.bmi.overweight} dari{" "}
              {row.bmi.everChecked})
            </>
          )}
        </Metric>
        <Metric label="Terlambat cek BMI" href={href(row.links.bmi)}>
          <Flagged n={row.bmi.late} tone="critical" />
        </Metric>
        <Metric label="Passed / Failed training" href={href(row.links.sdm)}>
          {row.training.passed} / {row.training.failed}
        </Metric>
        <Metric label="Failed tanpa remedial" href={href(row.links.remedial)}>
          <Flagged n={row.training.failedNoRemedial} tone="warning" />
        </Metric>
        {row.training.beda > 0 ? (
          <Metric label="Beda – verifikasi" href={href(row.links.sdm)}>
            <Flagged n={row.training.beda} tone="warning" />
          </Metric>
        ) : null}
      </ul>
    </li>
  );
}

/**
 * Phone version of the station comparison (under 768 px): one card per station with the
 * same figures and links as the table. Long lists are fine here: the sort order above
 * puts the stations that need attention first.
 */
export function StationCards({
  summary,
  rows,
  links,
}: {
  summary: DashboardSummary;
  rows: StationComparisonRow[];
  links: SheetLinks;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {summary.comparisonTotal ? (
        <Card row={summary.comparisonTotal} title="Semua stasiun" summary={summary} links={links} />
      ) : null}
      {rows.map((row) => (
        <Card key={row.station} row={row} title={row.station} summary={summary} links={links} />
      ))}
    </ul>
  );
}

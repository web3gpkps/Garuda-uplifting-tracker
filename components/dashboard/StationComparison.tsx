import Link from "next/link";
import type { ReactNode } from "react";
import {
  COMPARISON_SORTS,
  formatPercent,
  type ComparisonSort,
  type DashboardLink,
  type DashboardSummary,
  type StationComparisonRow,
} from "@/lib/dashboard";
import { formatScore, formatSignedScore } from "@/lib/format";
import type { SheetLinks } from "@/lib/workspace/access";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { cx } from "@/components/ui/cx";
import { linkTo } from "./KpiTile";

const cellLink = "-mx-3 -my-2 flex min-h-10 flex-col justify-center gap-1 px-3 py-2 hover:bg-paper";

export function Bar({ value, total, className }: { value: number; total: number; className?: string }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <span aria-hidden="true" className={cx("block h-1.5 w-full max-w-24 overflow-hidden rounded-control bg-neutral-tint", className)}>
      <span className="block h-full bg-brand" style={{ width: `${pct}%` }} />
    </span>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-ink-muted">{children}</span>;
}

/** A count that needs action reads in its status tone; zero stays quiet. */
export function Flagged({ n, tone }: { n: number; tone: "critical" | "warning" }) {
  if (n === 0) return <span className="tabular-nums">0</span>;
  return (
    <span className={cx("font-semibold tabular-nums", tone === "critical" ? "text-critical" : "text-warning")}>{n}</span>
  );
}

function Cell({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cellLink}>
      {children}
    </Link>
  );
}

function RatioText({ value, total }: { value: number; total: number }) {
  return (
    <span className="tabular-nums">
      <span className="font-semibold">{value}</span> dari {total}
    </span>
  );
}

type Labels = { week: string; bmi: string; notYet: string };

export function comparisonLabels(summary: Pick<DashboardSummary, "week" | "bmiPeriod" | "phase">): Labels {
  return {
    week: summary.week ? `Dinilai Mg ${summary.week}` : "Dinilai minggu ini",
    bmi: summary.bmiPeriod ? `Cek BMI periode ${summary.bmiPeriod}` : "Cek BMI periode ini",
    notYet: summary.phase === "before" ? "Belum mulai" : "Belum ada",
  };
}

function Row({
  row,
  links,
  labels,
  total,
  stationHref,
}: {
  row: StationComparisonRow;
  links: SheetLinks;
  labels: Labels;
  total: boolean;
  stationHref: ((link: DashboardLink) => string) | null;
}) {
  const href = (l: DashboardLink) => linkTo(links, l);
  return (
    <Tr className={total ? "font-semibold [&>*]:bg-paper" : undefined}>
      <Th scope="row" className="font-semibold whitespace-nowrap text-ink">
        {total ? (
          "Semua stasiun"
        ) : stationHref ? (
          <Link href={stationHref(row.links.station)} className="text-brand underline underline-offset-2">
            {row.station}
          </Link>
        ) : (
          row.station
        )}
      </Th>
      <Td numeric>
        <Cell href={href(row.links.sdm)}>
          <span className="tabular-nums">{row.staffCount}</span>
        </Cell>
      </Td>
      <Td>
        <Cell href={href(row.links.performa)}>
          {row.assessed.value === null ? (
            <Muted>{labels.notYet}</Muted>
          ) : (
            <>
              <RatioText value={row.assessed.value} total={row.assessed.total} />
              <Bar value={row.assessed.value} total={row.assessed.total} />
            </>
          )}
        </Cell>
      </Td>
      <Td numeric>
        <Cell href={href(row.links.rekap)}>
          {row.score.current === null ? (
            <Muted>Belum dinilai</Muted>
          ) : (
            <span className="tabular-nums">
              <span className="font-semibold">{formatScore(row.score.current)}</span>
              <span className="block text-xs text-ink-muted">
                baseline {formatScore(row.score.baseline) || "–"}
                {row.score.gain !== null ? `, ${formatSignedScore(row.score.gain)}` : ""}
              </span>
            </span>
          )}
        </Cell>
      </Td>
      <Td numeric>
        <Cell href={href(row.links.rekap)}>
          {row.rekap.assessed === 0 ? <Muted>–</Muted> : <RatioText value={row.rekap.lulus} total={row.rekap.assessed} />}
        </Cell>
      </Td>
      <Td>
        <Cell href={href(row.links.bmi)}>
          {row.bmi.checkedThisPeriod === null ? (
            <Muted>{labels.notYet}</Muted>
          ) : (
            <>
              <RatioText value={row.bmi.checkedThisPeriod} total={row.assessed.total} />
              <Bar value={row.bmi.checkedThisPeriod} total={row.assessed.total} />
            </>
          )}
        </Cell>
      </Td>
      <Td numeric>
        <Cell href={href(row.links.bmi)}>
          {row.bmi.pctOverweight === null ? (
            <Muted>Belum dicek</Muted>
          ) : (
            <span className="tabular-nums">
              <span className="font-semibold">{formatPercent(row.bmi.pctOverweight, 0)}</span>
              <span className="block text-xs text-ink-muted">
                {row.bmi.overweight} dari {row.bmi.everChecked}
              </span>
            </span>
          )}
        </Cell>
      </Td>
      <Td numeric>
        <Cell href={href(row.links.bmi)}>
          <Flagged n={row.bmi.late} tone="critical" />
        </Cell>
      </Td>
      <Td numeric>
        <Cell href={href(row.links.sdm)}>
          <span className="tabular-nums">
            {row.training.passed} / {row.training.failed}
          </span>
        </Cell>
      </Td>
      <Td numeric>
        <Cell href={href(row.links.remedial)}>
          <span className="tabular-nums">{row.training.remedialPassed}</span>
        </Cell>
      </Td>
      <Td numeric>
        <Cell href={href(row.links.remedial)}>
          <Flagged n={row.training.failedNoRemedial} tone="warning" />
        </Cell>
      </Td>
      <Td numeric>
        <Cell href={href(row.links.sdm)}>
          <Flagged n={row.training.beda} tone="warning" />
        </Cell>
      </Td>
      <Td numeric>
        <Cell href={href(row.links.penggantian)}>
          <span className="tabular-nums">{row.replacements}</span>
        </Cell>
      </Td>
    </Tr>
  );
}

/**
 * "How is each station doing?" (docs/UX.md §3): one row per station (about 22), sticky
 * header and station column, every cell a link to the sheet filtered to that station.
 * Server-component friendly.
 */
export function StationComparison({
  summary,
  rows,
  links,
  stationLinks,
}: {
  summary: DashboardSummary;
  /** summary.comparison, possibly sorted. */
  rows: StationComparisonRow[];
  links: SheetLinks;
  /** KPS / owner: the station name opens the dashboard filtered to it. */
  stationLinks: boolean;
}) {
  const labels = comparisonLabels(summary);
  const stationHref = stationLinks ? (l: DashboardLink) => linkTo(links, l) : null;
  return (
    <DataTable caption="Perbandingan stasiun" hideCaption minWidth="72rem" maxHeight="min(75dvh, 900px)">
      <thead>
        <tr>
          <Th className="align-bottom">Stasiun</Th>
          <Th numeric className="align-bottom">SDM</Th>
          <Th className="align-bottom">{labels.week}</Th>
          <Th numeric className="align-bottom">Skor terkini</Th>
          <Th numeric className="align-bottom whitespace-normal">Lulus coaching terkini</Th>
          <Th className="align-bottom">{labels.bmi}</Th>
          <Th numeric className="align-bottom whitespace-normal">Overweight + obesitas</Th>
          <Th numeric className="align-bottom whitespace-normal">Terlambat cek BMI</Th>
          <Th numeric className="align-bottom whitespace-normal">Passed / Failed</Th>
          <Th numeric className="align-bottom whitespace-normal">Lulus remedial</Th>
          <Th numeric className="align-bottom whitespace-normal">Failed tanpa remedial</Th>
          <Th numeric className="align-bottom whitespace-normal">Beda – verifikasi</Th>
          <Th numeric className="align-bottom">Penggantian</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Row key={row.station} row={row} links={links} labels={labels} total={false} stationHref={stationHref} />
        ))}
        {summary.comparisonTotal ? (
          <Row row={summary.comparisonTotal} links={links} labels={labels} total stationHref={null} />
        ) : null}
      </tbody>
    </DataTable>
  );
}

/** Sort choice for the comparison: real links (?urut=), so it survives a reload. */
export function ComparisonSortNav({
  current,
  hrefFor,
}: {
  current: ComparisonSort;
  hrefFor: (sort: ComparisonSort) => string;
}) {
  return (
    <nav aria-label="Urutkan stasiun" className="flex flex-wrap items-center gap-2" data-print="hide">
      <span className="text-sm font-semibold text-ink-muted">Urutkan</span>
      {COMPARISON_SORTS.map((s) => {
        const active = s.key === current;
        return (
          <Link
            key={s.key}
            href={hrefFor(s.key)}
            scroll={false}
            aria-current={active ? "true" : undefined}
            className={cx(
              "inline-flex min-h-11 items-center rounded-control border px-3 text-sm whitespace-nowrap transition-colors duration-150 sm:min-h-9",
              active
                ? "border-brand bg-brand-tint font-semibold text-ink"
                : "border-line-strong bg-surface text-ink hover:bg-neutral-tint",
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

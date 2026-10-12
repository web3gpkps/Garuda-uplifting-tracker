import Link from "next/link";
import type { ReactNode } from "react";
import type { DashboardLink, StationRow } from "@/lib/dashboard";
import type { SheetLinks } from "@/lib/workspace/access";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { Flagged, Value } from "./format";

type StationTableProps = {
  /** Worst first. */
  rows: StationRow[];
  total: StationRow;
  /** National action items flagged OVERDUE (shown on the total line). */
  actionOverdue: number;
  links: SheetLinks;
};

const cellLink = "-mx-3 -my-2 flex min-h-10 items-center justify-end px-3 py-2 hover:bg-bg";

function href(links: SheetLinks, link: DashboardLink): string {
  return links.to(link.sheet, link.query);
}

function Ratio({ value, total, reason }: { value: number | null; total: number; reason: string }) {
  if (value === null) return <Value value={null} emptyReason={reason} />;
  return (
    <span className="tabular-nums">
      {value}
      <span className="text-ink-muted">/{total}</span>
    </span>
  );
}

function CellLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cellLink}>
      {children}
    </Link>
  );
}

/**
 * KPS / owner: one row per station, worst first, then all stations together. The station
 * code opens that station's Beranda; each number opens the screen filtered to it.
 * Phone: the same rows stacked, one link per station.
 */
export function StationTable({ rows, total, actionOverdue, links }: StationTableProps) {
  const overdueHref = links.tindakLanjut;
  return (
    <>
      <div className="hidden md:block">
        <DataTable caption="Pekerjaan per stasiun, terburuk di atas" stickyHeader={rows.length > 12}>
          <thead>
            <tr>
              <Th>Stasiun</Th>
              <Th numeric>Dinilai</Th>
              <Th numeric>Cek BMI</Th>
              <Th numeric>Terlambat cek</Th>
              <Th numeric>Failed tanpa remedial</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.station}>
                <Th scope="row">
                  <Link href={href(links, r.links.station)} className="station-code text-brand underline underline-offset-2">
                    {r.station}
                  </Link>
                </Th>
                <Td numeric>
                  <CellLink href={href(links, r.links.performa)}>
                    <Ratio value={r.assessed} total={r.onDuty} reason="belum mulai" />
                  </CellLink>
                </Td>
                <Td numeric>
                  <CellLink href={href(links, r.links.bmi)}>
                    <Ratio value={r.bmiChecked} total={r.onDuty} reason="belum ada cek" />
                  </CellLink>
                </Td>
                <Td numeric>
                  <CellLink href={href(links, r.links.bmi)}>
                    <Flagged n={r.lateBmi} tone="critical" />
                  </CellLink>
                </Td>
                <Td numeric>
                  <CellLink href={href(links, r.links.remedial)}>
                    <Flagged n={r.failedNoRemedial} tone="warning" />
                  </CellLink>
                </Td>
              </Tr>
            ))}
            <Tr className="font-semibold [&>*]:bg-bg">
              <Th scope="row">Semua stasiun</Th>
              <Td numeric>
                <CellLink href={href(links, total.links.performa)}>
                  <Ratio value={total.assessed} total={total.onDuty} reason="belum mulai" />
                </CellLink>
              </Td>
              <Td numeric>
                <CellLink href={href(links, total.links.bmi)}>
                  <Ratio value={total.bmiChecked} total={total.onDuty} reason="belum ada cek" />
                </CellLink>
              </Td>
              <Td numeric>
                <CellLink href={href(links, total.links.bmi)}>
                  <Flagged n={total.lateBmi} tone="critical" />
                </CellLink>
              </Td>
              <Td numeric>
                <CellLink href={href(links, total.links.remedial)}>
                  <Flagged n={total.failedNoRemedial} tone="warning" />
                </CellLink>
              </Td>
            </Tr>
          </tbody>
        </DataTable>
      </div>

      <ul className="flex flex-col divide-y divide-line md:hidden" aria-label="Pekerjaan per stasiun, terburuk di atas">
        {rows.map((r) => (
          <li key={r.station}>
            <Link href={href(links, r.links.station)} className="flex min-h-12 flex-col justify-center gap-1 px-4 py-3 hover:bg-bg">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="station-code text-sm text-brand">{r.station}</span>
                {r.lateBmi > 0 ? <StatusChip label={`${r.lateBmi} terlambat cek`} tone="critical" /> : null}
                {r.failedNoRemedial > 0 ? (
                  <StatusChip label={`${r.failedNoRemedial} tanpa remedial`} tone="warning" />
                ) : null}
              </span>
              <PhoneCounts row={r} />
            </Link>
          </li>
        ))}
        <li className="flex min-h-12 flex-col justify-center gap-1 px-4 py-3">
          <span className="text-sm font-semibold text-ink">Semua stasiun</span>
          <PhoneCounts row={total} />
        </li>
      </ul>
      {actionOverdue > 0 ? (
        <p className="border-t border-line px-4 py-3 text-sm">
          <Link href={overdueHref} className="text-accent underline underline-offset-2">
            Tindak lanjut nasional: <span className="tabular-nums">{actionOverdue}</span> OVERDUE
          </Link>
        </p>
      ) : null}
    </>
  );
}

function PhoneCounts({ row }: { row: StationRow }) {
  return (
    <span className="text-sm text-ink-muted tabular-nums">
      Dinilai {row.assessed === null ? "–" : `${row.assessed}/${row.onDuty}`} · Cek BMI{" "}
      {row.bmiChecked === null ? "–" : `${row.bmiChecked}/${row.onDuty}`}
    </span>
  );
}

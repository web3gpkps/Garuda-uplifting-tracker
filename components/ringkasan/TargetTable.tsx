import { formatPercent, type TargetRow } from "@/lib/dashboard";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { Value } from "./format";

const pct = (v: number) => formatPercent(v);

/** Programme targets: KPI, posisi awal, target, sekarang, status. Phone: stacked rows. */
export function TargetTable({ rows }: { rows: TargetRow[] }) {
  return (
    <>
      <div className="hidden md:block">
        <DataTable caption="Target program" stickyHeader={false}>
          <thead>
            <tr>
              <Th>KPI</Th>
              <Th numeric>Posisi awal</Th>
              <Th numeric>Target</Th>
              <Th numeric>Sekarang</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.key}>
                <Th scope="row" className="text-ink">
                  {r.label}
                </Th>
                <Td numeric>
                  <Value value={r.baseline} format={pct} />
                </Td>
                <Td numeric className="whitespace-nowrap">
                  {r.target}
                </Td>
                <Td numeric className="font-semibold">
                  <Value value={r.actual} format={pct} emptyReason="belum ada data" />
                </Td>
                <Td>
                  <StatusChip label={r.status} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      <ul className="flex flex-col divide-y divide-line md:hidden" aria-label="Target program">
        {rows.map((r) => (
          <li key={r.key} className="flex min-h-12 flex-col justify-center gap-1 px-4 py-3">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">{r.label}</span>
              <StatusChip label={r.status} />
            </span>
            <span className="text-sm text-ink-muted tabular-nums">
              Sekarang {r.actual === null ? "–" : pct(r.actual)} · target {r.target} · awal{" "}
              {r.baseline === null ? "–" : pct(r.baseline)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

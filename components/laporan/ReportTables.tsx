/*
 * Laporan Mingguan sections A, A2, C and the table of D, with the workbook's columns (rows per
 * program IULS / RUST and TOTAL or SEMUA). Section B is the Dashboard's ActionProgressTable.
 * Rows come from lib/aggregate weeklyReport(); nothing is recomputed here.
 */
import type { AspectAverageRow, BmiSlotRow, TrendRow, WeeklyPerformanceRow } from "@/lib/aggregate";
import { formatPercent } from "@/lib/dashboard";
import { formatScore, formatSignedScore } from "@/lib/format";
import { COACHING_ASPECTS } from "@/lib/rules";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { Flagged } from "@/components/dashboard/StationComparison";
import { ColTh, Pct, RowTh, totalRowClass } from "@/components/ringkasan/DashboardTables";
import { Value } from "@/components/ringkasan/format";

/** Section A. */
export function WeeklyPerformanceTable({ caption, rows }: { caption: string; rows: WeeklyPerformanceRow[] }) {
  return (
    <DataTable caption={caption} hideCaption stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">Program</Th>
          <ColTh>Jumlah SDM</ColTh>
          <ColTh>Dinilai minggu ini</ColTh>
          <ColTh>Rata-rata minggu ini</ColTh>
          <ColTh>Rata-rata minggu lalu</ColTh>
          <ColTh>Perubahan vs minggu lalu</ColTh>
          <ColTh>Rata-rata Final Result training</ColTh>
          <ColTh>Kenaikan vs baseline*</ColTh>
          <ColTh>Lulus</ColTh>
          <ColTh>Belum Lulus</ColTh>
          <ColTh>% Lulus</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{r.key}</RowTh>
            <Td numeric>{r.staffCount}</Td>
            <Td numeric>{r.assessed}</Td>
            <Td numeric>
              <Value value={r.avgThisWeek} format={formatScore} />
            </Td>
            <Td numeric>
              <Value value={r.avgLastWeek} format={formatScore} />
            </Td>
            <Td numeric>
              <Value value={r.changeVsLastWeek} format={formatSignedScore} />
            </Td>
            <Td numeric>
              <Value value={r.baselineAvg} format={formatScore} />
            </Td>
            <Td numeric>
              <Value value={r.gainVsBaseline} format={formatSignedScore} />
            </Td>
            <Td numeric>{r.lulus}</Td>
            <Td numeric>{r.belumLulus}</Td>
            <Td numeric>
              <Pct value={r.pctLulus} digits={0} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function MetChip({ met }: { met: boolean | null }) {
  if (met === null) return <Value value={null} />;
  return <StatusChip label={met ? "Tercapai" : "Belum tercapai"} tone={met ? "good" : "warning"} />;
}

/** Section A2: mean per coaching aspect against the slide-15 targets. */
export function AspectTable({
  caption,
  rows,
  targetKnowledge,
  targetInteractive,
}: {
  caption: string;
  rows: AspectAverageRow[];
  /** Fractions 0..1 from Parameter. */
  targetKnowledge: number;
  targetInteractive: number;
}) {
  return (
    <DataTable caption={caption} hideCaption stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">Program</Th>
          {COACHING_ASPECTS.map((a) => (
            <ColTh key={a.key}>
              {a.letter}. {a.label}
            </ColTh>
          ))}
          <ColTh numeric={false}>Product Knowledge &gt; {formatPercent(targetKnowledge)}</ColTh>
          <ColTh numeric={false}>Interactive &gt; {formatPercent(targetInteractive)}</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{r.key}</RowTh>
            {COACHING_ASPECTS.map((a) => (
              <Td key={a.key} numeric>
                <Value value={r.averages[a.key]} format={formatScore} />
              </Td>
            ))}
            <Td>
              <MetChip met={r.knowledgeMet} />
            </Td>
            <Td>
              <MetChip met={r.communicationMet} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Section C: the BMI slot of the selected week. */
export function BmiSlotTable({ caption, rows }: { caption: string; rows: BmiSlotRow[] }) {
  return (
    <DataTable caption={caption} hideCaption stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">Program</Th>
          <ColTh>Jumlah SDM</ColTh>
          <ColTh>Sudah dicek</ColTh>
          <ColTh>Belum dicek</ColTh>
          <ColTh>Normal</ColTh>
          <ColTh>Kurus</ColTh>
          <ColTh>Overweight</ColTh>
          <ColTh>Obesitas</ColTh>
          <ColTh>% overweight + obesitas</ColTh>
          <ColTh>Terlambat cek (jadwal tiap SDM)</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{r.key}</RowTh>
            <Td numeric>{r.staffCount}</Td>
            <Td numeric>{r.checked}</Td>
            <Td numeric>{r.notChecked}</Td>
            <Td numeric>{r.normal}</Td>
            <Td numeric>{r.kurus}</Td>
            <Td numeric>{r.overweight}</Td>
            <Td numeric>{r.obesitas}</Td>
            <Td numeric>
              <Pct value={r.pctOverweight} />
            </Td>
            <Td numeric>
              <Flagged n={r.lateChecks} tone="critical" />
            </Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Section D table: mean weekly score per program and for everyone. */
export function TrendTable({ caption, rows, selectedWeek }: { caption: string; rows: TrendRow[]; selectedWeek: number }) {
  const weeks = rows[0]?.weeks.length ?? 0;
  return (
    <DataTable caption={caption} hideCaption stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">Program</Th>
          {Array.from({ length: weeks }, (_, i) => (
            <Th key={i} numeric className={i + 1 === selectedWeek ? "text-ink" : undefined}>
              Mg {i + 1}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{r.key}</RowTh>
            {r.weeks.map((v, i) => (
              <Td key={i} numeric>
                <Value value={v} format={formatScore} />
              </Td>
            ))}
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

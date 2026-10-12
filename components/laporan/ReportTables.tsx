/*
 * Laporan Mingguan tables: sections A, A2, B (action progress per group and per aspect),
 * C, the table of D, and the training results per program. Rows come from lib/aggregate
 * (weeklyReport() and dashboard()); nothing is recomputed here.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import {
  SEMUA,
  TOTAL,
  type ActionProgressRow,
  type AspectAverageRow,
  type BmiSlotRow,
  type ProgramResultRow,
  type TrendRow,
  type WeeklyPerformanceRow,
} from "@/lib/aggregate";
import { formatPercent } from "@/lib/dashboard";
import { formatProgress, formatScore, formatSignedScore } from "@/lib/format";
import { COACHING_ASPECTS } from "@/lib/rules";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { Flagged, Value } from "@/components/ringkasan/format";

/** Column header that may wrap onto two lines, so wide sections fit an A4 landscape page. */
function ColTh({ children, numeric = true }: { children: ReactNode; numeric?: boolean }) {
  return (
    <Th numeric={numeric} className="min-w-18 align-bottom whitespace-normal">
      {children}
    </Th>
  );
}

/** Row label cell; the TOTAL / SEMUA row reads heavier. */
function RowTh({ children }: { children: ReactNode }) {
  return (
    <Th scope="row" className="font-semibold whitespace-nowrap text-ink">
      {children}
    </Th>
  );
}

function totalRowClass(key: string): string | undefined {
  return key === TOTAL || key === SEMUA ? "font-semibold [&>*]:bg-bg" : undefined;
}

/** Fraction as a percentage with one decimal ("84,5%"), or a muted dash. */
function Pct({ value, digits = 1 }: { value: number | null | undefined; digits?: number }) {
  return <Value value={value} format={(v) => formatPercent(v, digits)} />;
}

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
          <ColTh>Kenaikan vs Final Result</ColTh>
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

/** Section A2: mean per coaching aspect against the programme targets. */
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
          <ColTh>Terlambat cek</ColTh>
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

/** Section B: action items per group or per aspect. */
export function ActionProgressTable({
  caption,
  rows,
  hideCaption = true,
  keyLabel = "Kelompok",
  hrefFor,
}: { caption: string; rows: ActionProgressRow[]; hideCaption?: boolean } & {
  keyLabel?: string;
  /** Opens Tindak Lanjut filtered to that group or aspect (not for TOTAL). */
  hrefFor?: (key: string) => string;
}) {
  return (
    <DataTable caption={caption} hideCaption={hideCaption} stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">{keyLabel}</Th>
          <ColTh>Total butir</ColTh>
          <ColTh>Selesai</ColTh>
          <ColTh>On Progress</ColTh>
          <ColTh>Belum Mulai</ColTh>
          <ColTh>Tertunda</ColTh>
          <ColTh>OVERDUE</ColTh>
          <ColTh>Jatuh tempo ≤ 7 hari</ColTh>
          <ColTh>% Selesai</ColTh>
          <ColTh>Rata-rata % progres</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>
              {hrefFor && r.key !== TOTAL ? (
                <Link href={hrefFor(r.key)} className="text-brand underline underline-offset-2">
                  {r.key}
                </Link>
              ) : (
                r.key
              )}
            </RowTh>
            <Td numeric>{r.total}</Td>
            <Td numeric>{r.selesai}</Td>
            <Td numeric>{r.onProgress}</Td>
            <Td numeric>{r.belumMulai}</Td>
            <Td numeric>{r.tertunda}</Td>
            <Td numeric>
              <Flagged n={r.overdue} tone="critical" />
            </Td>
            <Td numeric>
              <Flagged n={r.dueSoon} tone="warning" />
            </Td>
            <Td numeric>
              <Pct value={r.pctDone} digits={0} />
            </Td>
            <Td numeric>
              <Value value={r.avgProgress} format={formatProgress} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Training results per program, before and after remedial, against the posisi awal. */
export function ProgramResultsTable({ caption, rows, hideCaption = true }: { caption: string; rows: ProgramResultRow[]; hideCaption?: boolean }) {
  return (
    <DataTable caption={caption} hideCaption={hideCaption} stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th className="align-bottom">Program</Th>
          <ColTh>Peserta</ColTh>
          <ColTh>Passed</ColTh>
          <ColTh>Failed</ColTh>
          <ColTh>Failed karena absen role play</ColTh>
          <ColTh>Remedial tercatat</ColTh>
          <ColTh>Lulus remedial</ColTh>
          <ColTh>Lulus akhir</ColTh>
          <ColTh>% lulus akhir</ColTh>
          <ColTh>Posisi awal (Gapura)</ColTh>
          <ColTh>Perlu verifikasi</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{r.key}</RowTh>
            <Td numeric>{r.participants}</Td>
            <Td numeric>{r.passed}</Td>
            <Td numeric>{r.failed}</Td>
            <Td numeric>{r.absentRolePlay}</Td>
            <Td numeric>{r.remedialRecorded}</Td>
            <Td numeric>{r.remedialPassed}</Td>
            <Td numeric>{r.finalPassed}</Td>
            <Td numeric className="font-semibold">
              <Pct value={r.pctFinalPassed} />
            </Td>
            <Td numeric>
              <Pct value={r.pdfBaseline} />
            </Td>
            <Td numeric>
              <Flagged n={r.beda} tone="warning" />
            </Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

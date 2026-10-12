/*
 * The workbook's Dashboard sections 1–6 as tables, with the workbook's own column meanings.
 * Action progress per group is also Laporan Mingguan section B (same formula, same table).
 * Rows come straight from lib/aggregate; nothing is recomputed here.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import {
  SEMUA,
  TOTAL,
  type ActionProgressRow,
  type KpiRow,
  type ProgramResultRow,
  type ReplacementOverview,
  type UnitRow,
} from "@/lib/aggregate";
import { formatPercent, targetText, toneForStatus } from "@/lib/dashboard";
import { formatProgress, formatScore, formatSignedKg, formatSignedScore } from "@/lib/format";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { Flagged } from "@/components/dashboard/StationComparison";
import { Value } from "./format";

/** Column header that may wrap onto two lines, so wide sections fit an A4 landscape page. */
export function ColTh({ children, numeric = true }: { children: ReactNode; numeric?: boolean }) {
  return (
    <Th numeric={numeric} className="min-w-18 align-bottom whitespace-normal">
      {children}
    </Th>
  );
}

/** Row label cell; the TOTAL / SEMUA row reads heavier, like the workbook's bold total line. */
export function RowTh({ children }: { children: ReactNode }) {
  return (
    <Th scope="row" className="font-semibold whitespace-nowrap text-ink">
      {children}
    </Th>
  );
}

export function totalRowClass(key: string): string | undefined {
  return key === TOTAL || key === SEMUA ? "font-semibold [&>*]:bg-paper" : undefined;
}

/** Fraction as a percentage with one decimal ("84,5%"), or a muted dash. */
export function Pct({ value, digits = 1 }: { value: number | null | undefined; digits?: number }) {
  return <Value value={value} format={(v) => formatPercent(v, digits)} />;
}

type TableProps<T> = { caption: string; rows: T[]; hideCaption?: boolean };

/** Dashboard 1: KPI of slide 15, actual against the PDF baseline and the target. */
export function KpiTable({ caption, rows, hideCaption = true }: TableProps<KpiRow>) {
  return (
    <DataTable caption={caption} hideCaption={hideCaption} stickyHeader={false} density="dense" minWidth="52rem">
      <thead>
        <tr>
          <Th className="align-bottom">KPI</Th>
          <ColTh>Baseline PDF</ColTh>
          <ColTh>Target</ColTh>
          <ColTh>Aktual</ColTh>
          <ColTh numeric={false}>Status</ColTh>
          <ColTh numeric={false}>Dasar hitung</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key}>
            <Th scope="row" className="font-semibold whitespace-normal text-ink">
              {r.label}
            </Th>
            <Td numeric>
              <Pct value={r.baseline} />
            </Td>
            <Td numeric className="whitespace-nowrap">
              {targetText(r)?.replace(/^Target /, "") ?? <span className="text-ink-muted">vs baseline</span>}
            </Td>
            <Td numeric className="font-semibold">
              <Pct value={r.actual} />
            </Td>
            <Td>
              <StatusChip label={r.status} tone={toneForStatus(r.status)} />
            </Td>
            <Td className="min-w-64 text-xs whitespace-normal text-ink-muted">{r.basis}</Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Dashboard 2–3 / Laporan B: action items per group or per aspect. */
export function ActionProgressTable({
  caption,
  rows,
  hideCaption = true,
  keyLabel = "Kelompok",
  hrefFor,
}: TableProps<ActionProgressRow> & {
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

/** Dashboard 4: training results per program, before and after remedial, against the PDF. */
export function ProgramResultsTable({ caption, rows, hideCaption = true }: TableProps<ProgramResultRow>) {
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
          <ColTh>Baseline PDF (Gapura)</ColTh>
          <ColTh>Beda – verifikasi</ColTh>
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

/** Dashboard 5: per station, with the workbook's columns. */
export function UnitTable({ caption, rows, hideCaption = true }: TableProps<UnitRow>) {
  return (
    <DataTable caption={caption} hideCaption={hideCaption} density="dense" maxHeight="min(70dvh, 760px)">
      <thead>
        <tr>
          <Th className="align-bottom">Stasiun</Th>
          <ColTh>Jumlah SDM</ColTh>
          <ColTh>Passed</ColTh>
          <ColTh>Failed</ColTh>
          <ColTh>Rata-rata Final Result</ColTh>
          <ColTh>Rata-rata skor terkini</ColTh>
          <ColTh>Kenaikan</ColTh>
          <ColTh>SDM naik</ColTh>
          <ColTh>Lulus coaching terkini</ColTh>
          <ColTh>Sudah cek BMI</ColTh>
          <ColTh>Overweight + obesitas</ColTh>
          <ColTh>Rata-rata Δ berat (kg)</ColTh>
          <ColTh>Lulus remedial</ColTh>
          <ColTh>Penggantian</ColTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.key} className={totalRowClass(r.key)}>
            <RowTh>{r.key}</RowTh>
            <Td numeric>{r.staffCount}</Td>
            <Td numeric>{r.passed}</Td>
            <Td numeric>{r.failed}</Td>
            <Td numeric>
              <Value value={r.avgFinal} format={formatScore} />
            </Td>
            <Td numeric>
              <Value value={r.avgCurrent} format={formatScore} />
            </Td>
            <Td numeric>
              <Value value={r.gain} format={formatSignedScore} />
            </Td>
            <Td numeric>{r.improved}</Td>
            <Td numeric>{r.currentLulus}</Td>
            <Td numeric>{r.bmiChecked}</Td>
            <Td numeric>{r.overweight}</Td>
            <Td numeric>
              <Value value={r.avgWeightDelta} format={formatSignedKg} />
            </Td>
            <Td numeric>{r.remedialPassed}</Td>
            <Td numeric>{r.replacements}</Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Dashboard 6: replacements in view. */
export function ReplacementOverviewTable({ caption, overview }: { caption: string; overview: ReplacementOverview }) {
  const rows: Array<[string, number, boolean]> = [
    ["SDM akan diganti", overview.toReplace, false],
    ["Pengganti sudah ditempatkan", overview.placed, false],
    ["Pengganti lulus training", overview.passed, false],
    ["Lewat batas / OVERDUE", overview.lateOrOverdue, true],
    ["Sudah dilaporkan", overview.reported, false],
  ];
  return (
    <DataTable caption={caption} hideCaption stickyHeader={false} density="dense">
      <thead>
        <tr>
          <Th>Penggantian SDM</Th>
          <Th numeric>Jumlah</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, n, flag]) => (
          <Tr key={label}>
            <RowTh>{label}</RowTh>
            <Td numeric>{flag ? <Flagged n={n} tone="critical" /> : n}</Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}

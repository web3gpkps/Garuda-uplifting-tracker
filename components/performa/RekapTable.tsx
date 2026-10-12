import type { StaffRekap } from "@/lib/rules";
import { DataTable, DataTableEmpty, Td, Th } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDecimal, formatScore, formatSignedScore } from "@/lib/format";
import { toneOf } from "./format";

export type RekapRow = {
  code: string;
  name: string;
  program: string | null;
  station: string;
  rekap: StaffRekap;
};

type RekapTableProps = {
  caption: string;
  rows: RekapRow[];
  weeks: number;
  /** Current programme week (column gets the --brand-tint the rail uses), or null outside the programme. */
  currentWeek: number | null;
  /** Show the Unit column (KPS / owner looking at several stations). */
  showStation: boolean;
};

/**
 * Rekap Performa: staff × Mg 1..N weekly coaching averages, the Final Result baseline,
 * latest score, gain, weeks assessed, current status and trend (lib/rules staffRekap).
 * Weeks without a score stay blank (never 0). Server component.
 */
export function RekapTable({ caption, rows, weeks, currentWeek, showStation }: RekapTableProps) {
  const weekNumbers = Array.from({ length: weeks }, (_, i) => i + 1);
  const columns = 3 + (showStation ? 1 : 0) + weeks + 5;
  const currentCell = "bg-brand-tint";

  return (
    <DataTable caption={caption} hideCaption density="dense" minWidth={`${52 + weeks * 4}rem`}>
      <thead>
        <tr>
          <Th>SDM</Th>
          <Th>Program</Th>
          {showStation ? <Th>Unit</Th> : null}
          <Th numeric>Final Result (baseline)</Th>
          {weekNumbers.map((w) => (
            <Th key={w} numeric className={w === currentWeek ? currentCell : undefined}>
              <span aria-hidden="true">Mg {w}</span>
              <span className="sr-only">
                Minggu ke-{w}
                {w === currentWeek ? ", minggu berjalan" : ""}
              </span>
            </Th>
          ))}
          <Th numeric>Skor terkini</Th>
          <Th numeric>Kenaikan</Th>
          <Th numeric>Minggu dinilai</Th>
          <Th>Status terkini</Th>
          <Th>Tren</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <DataTableEmpty colSpan={columns} title="Belum ada SDM di lingkup ini">
            Tambahkan SDM di halaman Master SDM; rekap terisi setelah nilai mingguan mereka disimpan.
          </DataTableEmpty>
        ) : (
          rows.map(({ code, name, program, station, rekap }) => (
            <tr key={code}>
              <Th scope="row" className="sm:min-w-52">
                <span className="block font-semibold text-ink">{name}</span>
                <span className="block text-xs font-normal text-ink-muted tabular-nums">{code}</span>
              </Th>
              <Td>{program}</Td>
              {showStation ? <Td>{station}</Td> : null}
              <Td numeric>{formatDecimal(rekap.baseline, 1)}</Td>
              {rekap.weekly.map((value, i) => (
                <Td key={i} numeric className={i + 1 === currentWeek ? currentCell : undefined}>
                  {formatScore(value)}
                </Td>
              ))}
              <Td numeric className="font-semibold">
                {formatScore(rekap.latest)}
              </Td>
              <Td numeric>{formatSignedScore(rekap.gain)}</Td>
              <Td numeric>{rekap.weeksAssessed}</Td>
              <Td>
                <StatusChip label={rekap.currentStatus} tone={toneOf(rekap.currentStatus)} emptyLabel="Belum dinilai" />
              </Td>
              <Td>{rekap.trend ? <StatusChip label={rekap.trend} tone={toneOf(rekap.trend)} /> : null}</Td>
            </tr>
          ))
        )}
      </tbody>
    </DataTable>
  );
}

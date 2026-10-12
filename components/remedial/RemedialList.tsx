import type { Settings } from "@/lib/rules";
import { formatTanggalPendek } from "@/lib/dates";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { RemedialEditor } from "./RemedialEditor";
import { formatGain, formatScore1, shortCause, type RemedialListRow } from "./rows";

type RemedialListProps = {
  caption: string;
  rows: RemedialListRow[];
  accessKey: string;
  settings: Settings;
  showStation: boolean;
};

function score(value: number | null): string {
  return value === null ? "–" : formatScore1(value);
}

/**
 * The Failed participants, already in status order. From 900 px a table with one action per
 * row; below it one card per participant. Server component (the editor is a client island).
 */
export function RemedialList({ caption, rows, accessKey, settings, showStation }: RemedialListProps) {
  return (
    <>
      <div className="hidden grid:block">
        <DataTable caption={caption} minWidth={showStation ? "68rem" : "62rem"}>
          <thead>
            <tr>
              <Th>Nama</Th>
              <Th>Program</Th>
              {showStation ? <Th>Stasiun</Th> : null}
              <Th numeric>Final awal</Th>
              <Th>Penyebab</Th>
              <Th>Tindakan</Th>
              <Th>Tgl</Th>
              <Th numeric>Final ulang</Th>
              <Th numeric>Kenaikan</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Aksi</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.code}>
                <Th scope="row" className="font-normal">
                  <span className="block font-semibold text-ink">{row.name}</span>
                  <span className="block text-xs text-ink-muted tabular-nums">{row.code}</span>
                </Th>
                <Td>{row.program ?? "–"}</Td>
                {showStation ? <Td className="station-code">{row.station ?? "–"}</Td> : null}
                <Td numeric>{score(row.baselineFinal)}</Td>
                <Td>
                  <span title={row.failureCause ?? undefined}>{shortCause(row.failureCause) ?? "–"}</span>
                </Td>
                <Td>{row.remedial?.action ?? "–"}</Td>
                <Td className="tabular-nums">
                  {row.remedial?.remedialOn ? formatTanggalPendek(row.remedial.remedialOn) : "–"}
                </Td>
                <Td numeric className="font-semibold">
                  {score(row.finalResult)}
                </Td>
                <Td numeric>{row.gain === null ? "–" : formatGain(row.gain)}</Td>
                <Td>
                  <StatusChip label={row.status} />
                </Td>
                <Td className="text-right">
                  <RemedialEditor accessKey={accessKey} row={row} settings={settings} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      <ol aria-label={caption} className="flex flex-col divide-y divide-line grid:hidden">
        {rows.map((row) => (
          <li key={row.code} className="flex flex-col gap-2 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 font-semibold text-ink [overflow-wrap:anywhere]">{row.name}</p>
              <StatusChip label={row.status} />
            </div>
            <p className="text-xs text-ink-muted tabular-nums">
              {[row.code, row.program, showStation ? row.station : null].filter(Boolean).join(" · ")}
            </p>
            <p className="text-sm text-ink tabular-nums">
              Final awal {score(row.baselineFinal)}
              {row.failureCause ? <span className="text-ink-muted"> · {shortCause(row.failureCause)}</span> : null}
            </p>
            {row.remedial?.action ? (
              <p className="text-sm text-ink tabular-nums">
                {row.remedial.action}
                {row.remedial.remedialOn ? ` · ${formatTanggalPendek(row.remedial.remedialOn)}` : ""}
                {row.finalResult !== null ? (
                  <span className="text-ink-muted">
                    {" "}
                    · Final ulang {score(row.finalResult)}
                    {row.gain !== null ? ` (${formatGain(row.gain)})` : ""}
                  </span>
                ) : null}
              </p>
            ) : null}
            <RemedialEditor accessKey={accessKey} row={row} settings={settings} fullWidth />
          </li>
        ))}
      </ol>
    </>
  );
}

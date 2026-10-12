"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { DataGrid, type CellValue, type GridColumn, type SaveRowResult } from "@/components/grid/DataGrid";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDecimal } from "@/lib/format";
import { PROGRAMS, type ReplacementPass, type ReplacementTimeliness } from "@/lib/rules";
import { saveReplacement } from "./actions";
import { isPlausibleDate } from "@/components/bmi/format";
import { ReplacementDeleteButton, type ReplacementContext, type ReplacementFormRow } from "./ReplacementDialogs";

export type ReplacementGridRow = ReplacementFormRow & {
  pass: ReplacementPass | null;
  timeliness: ReplacementTimeliness | null;
  /** "tautan ini, 8 Okt 07.55" or "pengelola". */
  changed: string;
};

type ReplacementGridProps = {
  caption: string;
  rows: ReplacementGridRow[];
  ctx: ReplacementContext;
  summary: string;
  actions?: ReactNode;
  phone: ReactNode;
};

const rowKey = (r: ReplacementGridRow) => String(r.id);
const rowLabel = (r: ReplacementGridRow) => `${r.replacedName}${r.station ? `, ${r.station}` : ""}`;
const SEARCH = {
  placeholder: "Nama atau ID SDM",
  text: (r: ReplacementGridRow) => `${r.replacedName} ${r.staffCode ?? ""} ${r.replacementName ?? ""}`,
};

/** Plain-language messages for share_save_replacement's invalid_input fields. */
const FIELD_MESSAGE: Record<string, string> = {
  program: "Pilih program IULS atau RUST.",
  station: "Pilih stasiun yang benar.",
  staff_code: "SDM ini bukan dari stasiun baris ini. Pilih SDM stasiun yang sama.",
  replaced_name: "Isi nama SDM yang diganti.",
  post_test: "Post-test harus 0 sampai 100.",
  final_result: "Nilai akhir harus 0 sampai 100.",
  reported: "Pilih Ya atau Belum.",
};

/** Server field name (share_save_replacement DETAIL) → grid column key. */
const COLUMN_OF_FIELD: Record<string, string> = {
  program: "program",
  station: "station",
  staff_code: "staff_code",
  replaced_name: "replaced_name",
  reason: "reason",
  replacement_name: "replacement_name",
  post_test: "post_test",
  final_result: "final_result",
  reported: "reported",
  notes: "notes",
  withdrawn_on: "withdrawn_on",
  effective_on: "effective_on",
  training_on: "training_on",
};

function chip(value: CellValue) {
  return value ? <StatusChip label={String(value)} /> : null;
}

const dateRule = (value: CellValue) =>
  typeof value === "string" && !isPlausibleDate(value) ? "Tanggal tidak valid." : null;

/** A score against its minimum in words as well as colour ("85, memenuhi"). */
function againstMinimum(value: CellValue, min: number, digits: number) {
  if (typeof value !== "number") return null;
  const ok = value >= min;
  return (
    <span className="flex items-baseline justify-end gap-1.5">
      <span className="tabular-nums">{formatDecimal(value, digits, 2)}</span>
      <span className={ok ? "text-xs font-semibold text-good" : "text-xs font-semibold text-critical"}>
        {ok ? "cukup" : "kurang"}
      </span>
    </span>
  );
}

/**
 * Penggantian SDM as an entry grid: one row per replacement, every input
 * inline, Status kelulusan and Ketepatan waktu computed read-only, "Hapus" per row. A row
 * saves itself through share_save_replacement, which writes every field, so the changed
 * cells are merged with the stored row. Client component.
 */
export function ReplacementGrid({ caption, rows, ctx, summary, actions, phone }: ReplacementGridProps) {
  const { accessKey, fixedStation, settings } = ctx;
  const staffKey = ctx.staff
    .map((s) => `${s.code}\u0001${s.name}\u0001${s.station ?? ""}\u0001${s.program ?? ""}`)
    .join("\u0002");
  const stationsKey = ctx.stations.join(",");

  const columns = useMemo<GridColumn<ReplacementGridRow>[]>(() => {
    const entries = staffKey ? staffKey.split("\u0002").map((entry) => entry.split("\u0001")) : [];
    const staff = entries.map(([code, name]) => ({ value: code, label: `${code} ${name}` }));
    const stationOf = new Map(entries.map(([code, , station]) => [code, station]));
    const canPickStation = fixedStation === null;
    const minPass = formatDecimal(settings.passGrade, 0, 2);
    return [
      {
        key: "replaced_name",
        header: "SDM diganti",
        width: 200,
        editor: "text",
        required: true,
        maxLength: 200,
        frozen: true,
        get: (r) => r.replacedName,
      },
      {
        key: "program",
        header: "Program",
        group: "SDM diganti",
        width: 92,
        editor: "select",
        options: PROGRAMS.map((value) => ({ value })),
        get: (r) => r.program,
      },
      {
        key: "station",
        header: "Stasiun",
        group: "SDM diganti",
        width: 84,
        editor: "select",
        required: canPickStation,
        options: stationsKey.split(",").map((value) => ({ value })),
        editable: () => canPickStation,
      },
      {
        key: "staff_code",
        header: "ID SDM",
        label: "ID SDM yang diganti (dari Master SDM)",
        group: "SDM diganti",
        width: 104,
        editor: "select",
        options: staff,
        get: (r) => r.staffCode,
        validate: (value, row) => {
          if (typeof value !== "string" || !row.station) return null;
          const station = stationOf.get(value);
          return station && station !== row.station ? `Pilih SDM dari stasiun ${row.station}.` : null;
        },
        // The list shows "IULS-01 <nama>"; the cell only needs the ID (name is the first column).
        render: (value) => (value ? <span className="tabular-nums">{String(value)}</span> : null),
      },
      { key: "reason", header: "Alasan", group: "SDM diganti", width: 220, editor: "longtext", maxLength: 4000 },
      {
        key: "withdrawn_on",
        header: "Tgl ditarik",
        group: "SDM diganti",
        width: 112,
        editor: "date",
        get: (r) => r.withdrawnOn,
        validate: dateRule,
      },
      {
        key: "replacement_name",
        header: "SDM pengganti",
        group: "Pengganti",
        width: 180,
        editor: "text",
        maxLength: 200,
        get: (r) => r.replacementName,
      },
      {
        key: "effective_on",
        header: "Tgl efektif",
        group: "Pengganti",
        width: 112,
        editor: "date",
        get: (r) => r.effectiveOn,
        validate: dateRule,
      },
      {
        key: "training_on",
        header: "Tgl training",
        group: "Pengganti",
        width: 112,
        editor: "date",
        get: (r) => r.trainingOn,
        validate: dateRule,
      },
      {
        key: "post_test",
        header: `Post-test (≥ ${minPass})`,
        label: `Post-test, syarat minimal ${minPass}`,
        group: "Pengganti",
        width: 128,
        editor: "number",
        min: 0,
        max: 100,
        decimals: 2,
        get: (r) => r.postTest,
        render: (value) => againstMinimum(value, settings.passGrade, 0),
      },
      {
        key: "final_result",
        header: `Nilai akhir (≥ ${minPass})`,
        label: `Nilai akhir training, 0 sampai 100, syarat minimal ${minPass}`,
        group: "Pengganti",
        width: 140,
        editor: "number",
        min: 0,
        max: 100,
        decimals: 2,
        get: (r) => r.finalResult,
        render: (value) => againstMinimum(value, settings.passGrade, 0),
      },
      { key: "pass", header: "Status kelulusan", group: "Pengganti", width: 184, editor: "readonly", get: (r) => r.pass, render: chip },
      {
        key: "timeliness",
        header: "Ketepatan waktu",
        group: "Pengganti",
        width: 132,
        editor: "readonly",
        get: (r) => r.timeliness,
        render: chip,
      },
      {
        key: "reported",
        header: "Dilaporkan",
        label: "Dilaporkan ke OAO/Direksi",
        group: "Pelaporan",
        width: 104,
        editor: "select",
        options: [{ value: "Ya" }, { value: "Belum" }],
        get: (r) => (r.reported === "Ya" || r.reported === "Belum" ? r.reported : null),
        render: chip,
      },
      { key: "notes", header: "Catatan", group: "Pelaporan", width: 220, editor: "longtext", maxLength: 4000 },
      {
        key: "changed",
        header: "Terakhir diubah lewat",
        width: 240,
        editor: "readonly",
        render: (_value, r) => <span className="text-xs text-ink-muted">{r.changed}</span>,
      },
    ];
  }, [staffKey, stationsKey, fixedStation, settings.passGrade]);

  const rowActions = useMemo(
    () => ({
      header: "Aksi",
      width: 84,
      render: (row: ReplacementGridRow) => <ReplacementDeleteButton ctx={ctx} id={row.id} name={row.replacedName} />,
    }),
    [ctx],
  );

  const onSaveRow = useCallback(
    async (_key: string, changes: Record<string, CellValue>, row: ReplacementGridRow): Promise<SaveRowResult> => {
      const pick = <T,>(field: string, stored: T): T => (field in changes ? (changes[field] as T) : stored);
      const staffCode = pick<string | null>("staff_code", row.staffCode);
      let replacedName = pick<string | null>("replaced_name", row.replacedName);
      let program = pick<string | null>("program", row.program);
      // Picking someone from the roster fills the name and program, as in the add form.
      const person = "staff_code" in changes && staffCode ? ctx.staff.find((s) => s.code === staffCode) : undefined;
      if (person && !("replaced_name" in changes)) replacedName = person.name;
      if (person?.program && !("program" in changes)) program = person.program;
      const reported = pick<string | null>("reported", row.reported);
      let result: Awaited<ReturnType<typeof saveReplacement>>;
      try {
        result = await saveReplacement(accessKey, {
          id: row.id,
          program,
          station: fixedStation ?? pick<string | null>("station", row.station),
          staffCode,
          replacedName,
          reason: pick<string | null>("reason", row.reason),
          withdrawnOn: pick<string | null>("withdrawn_on", row.withdrawnOn),
          replacementName: pick<string | null>("replacement_name", row.replacementName),
          effectiveOn: pick<string | null>("effective_on", row.effectiveOn),
          trainingOn: pick<string | null>("training_on", row.trainingOn),
          postTest: pick<number | null>("post_test", row.postTest),
          finalResult: pick<number | null>("final_result", row.finalResult),
          reported: reported === "Ya" || reported === "Belum" ? reported : null,
          notes: pick<string | null>("notes", row.notes),
        });
      } catch {
        return { ok: false, message: "Koneksi ke server terputus. Isian tetap ada; coba simpan lagi." };
      }
      if (result.ok) return { ok: true };
      const field = result.error.code === "invalid_input" ? result.error.field : undefined;
      const column = field ? COLUMN_OF_FIELD[field] : undefined;
      const text = (field && FIELD_MESSAGE[field]) || result.error.message;
      return { ok: false, message: text, fieldErrors: column ? { [column]: text } : undefined };
    },
    [accessKey, fixedStation, ctx.staff],
  );

  return (
    <DataGrid
      caption={caption}
      rows={rows}
      columns={columns}
      rowKey={rowKey}
      rowLabel={rowLabel}
      onSaveRow={onSaveRow}
      search={SEARCH}
      summary={summary}
      actions={actions}
      rowActions={rowActions}
      phone={phone}
    />
  );
}

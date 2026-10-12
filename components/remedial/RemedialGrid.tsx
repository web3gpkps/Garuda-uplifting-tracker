"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import {
  DataGrid,
  type CellValue,
  type ConfirmClear,
  type GridColumn,
  type SaveRowResult,
} from "@/components/grid/DataGrid";
import { StatusChip } from "@/components/ui/StatusChip";
import { finalResult, REMEDIAL_ACTIONS, remedialResult, cleanFloat, type Settings } from "@/lib/rules";
import { isPlausibleDate } from "@/components/bmi/format";
import { saveRemedial } from "./actions";
import { RemedialDeleteButton } from "./RemedialDialogs";
import { formatGain, formatScore1, remedialTone, shortCause, type RemedialListRow } from "./rows";

export type RemedialGridRow = RemedialListRow & {
  /** "tautan ini, 8 Okt 07.55"; null when nothing is recorded yet. */
  changed: string | null;
};

type RemedialGridProps = {
  caption: string;
  rows: RemedialGridRow[];
  accessKey: string;
  settings: Settings;
  showStation: boolean;
  summary: string;
  emptyState: ReactNode;
  phone: ReactNode;
};

const rowKey = (r: RemedialGridRow) => r.code;
const rowLabel = (r: RemedialGridRow) => `${r.code}, ${r.name}`;
const SEARCH = { placeholder: "Nama atau ID", text: (r: RemedialGridRow) => `${r.code} ${r.name}` };

/** share_save_remedial invalid_input DETAIL → grid column and a plain message. */
const COLUMN_OF_FIELD: Record<string, string> = {
  action: "action",
  remedial_on: "remedial_on",
  role_play: "role_play",
  post_test: "post_test",
  reported: "reported",
  notes: "notes",
};
const FIELD_MESSAGE: Record<string, string> = {
  action: "Pilih tindakan remedial dari daftar.",
  remedial_on: "Tanggal remedial tidak valid.",
  role_play: "Role play ulang harus 0 sampai 100.",
  post_test: "Post-test ulang harus 0 sampai 100.",
  reported: "Pilih Ya atau Belum.",
  notes: "Catatan terlalu panjang.",
};

/** Emptying every input of a stored row deletes it in SQL, so the grid asks first. */
const CONFIRM_CLEAR: ConfirmClear<RemedialGridRow> = {
  fields: ["action", "remedial_on", "role_play", "post_test", "reported", "notes"],
  message: (row) => `Hapus data remedial ${row.name}?`,
  description: "Semua isian remedial baris ini kosong, jadi datanya dihapus. Peserta tetap di daftar selama hasil training awalnya Failed.",
  confirmLabel: "Hapus data remedial",
};

const num = (value: CellValue) => (typeof value === "number" ? value : null);
const text = (value: CellValue) => (typeof value === "string" && value.trim() !== "" ? value : null);

/**
 * Remedial (PDF slide 27 "Fase Remidiasi") as a sheet: one row per Failed participant. Input
 * cells (yellow): Tindakan, Tgl remedial, Role play ulang, Post-test ulang, Dilaporkan,
 * Catatan. Final ulang, Kenaikan and Status follow the row live (lib/rules remedialResult).
 * A row saves itself through share_save_remedial, which writes every field, so the changed
 * cells are merged with the stored row. Client component.
 */
export function RemedialGrid({
  caption,
  rows,
  accessKey,
  settings,
  showStation,
  summary,
  emptyState,
  phone,
}: RemedialGridProps) {
  const { passGrade, weightRolePlay, weightPostTest } = settings;

  const columns = useMemo<GridColumn<RemedialGridRow>[]>(() => {
    const s = { ...settings, passGrade, weightRolePlay, weightPostTest };
    const liveFinal = (value: (key: string) => CellValue) => finalResult(num(value("role_play")), num(value("post_test")), s);
    const out: GridColumn<RemedialGridRow>[] = [
      { key: "code", header: "ID", width: 92, editor: "readonly", frozen: true },
      { key: "name", header: "Nama", width: 188, editor: "readonly", frozen: true },
      { key: "program", header: "Program", width: 76, editor: "readonly" },
    ];
    if (showStation) out.push({ key: "station", header: "Stasiun", width: 72, editor: "readonly" });
    out.push(
      {
        key: "baseline_final",
        header: "Final awal",
        label: "Final Result awal (training)",
        group: "Hasil training",
        width: 84,
        editor: "readonly",
        align: "end",
        get: (r) => r.baselineFinal,
        render: (value) => formatScore1(num(value)),
      },
      {
        key: "cause",
        header: "Penyebab",
        label: "Penyebab gagal",
        group: "Hasil training",
        width: 168,
        editor: "readonly",
        get: (r) => shortCause(r.failureCause),
        render: (value, r) =>
          value ? (
            <span title={r.failureCause ?? undefined} className="text-sm">
              {String(value)}
            </span>
          ) : r.failed ? null : (
            <span className="text-xs text-ink-muted">tidak Failed</span>
          ),
      },
      {
        key: "action",
        header: "Tindakan",
        label: "Tindakan remedial",
        group: "Remedial",
        width: 232,
        editor: "select",
        options: REMEDIAL_ACTIONS.map((value) => ({ value })),
        get: (r) => r.remedial?.action ?? null,
      },
      {
        key: "remedial_on",
        header: "Tgl remedial",
        group: "Remedial",
        width: 112,
        editor: "date",
        get: (r) => r.remedial?.remedialOn ?? null,
        validate: (value) => (typeof value === "string" && !isPlausibleDate(value) ? "Tanggal tidak valid." : null),
      },
      {
        key: "role_play",
        header: "Role play ulang",
        group: "Remedial",
        width: 104,
        editor: "number",
        min: 0,
        max: 100,
        decimals: 2,
        get: (r) => r.remedial?.rolePlay ?? null,
      },
      {
        key: "post_test",
        header: "Post-test ulang",
        group: "Remedial",
        width: 104,
        editor: "number",
        min: 0,
        max: 100,
        decimals: 2,
        get: (r) => r.remedial?.postTest ?? null,
      },
      {
        key: "final",
        header: "Final ulang",
        label: `Final Result ulang (role play ${Math.round(weightRolePlay * 100)}%, post-test ${Math.round(weightPostTest * 100)}%)`,
        group: "Remedial",
        width: 88,
        editor: "readonly",
        align: "end",
        derive: (_row, value) => liveFinal(value),
        render: (value) => <span className="font-semibold">{formatScore1(num(value))}</span>,
      },
      {
        key: "gain",
        header: "Kenaikan",
        label: "Kenaikan: Final ulang dikurangi Final awal",
        group: "Remedial",
        width: 84,
        editor: "readonly",
        align: "end",
        derive: (row, value) => {
          const f = liveFinal(value);
          return f === null || row.baselineFinal === null ? null : cleanFloat(f - row.baselineFinal);
        },
        render: (value) => formatGain(num(value)),
      },
      {
        key: "status",
        header: `Status (≥ ${formatScore1(passGrade)})`,
        label: `Status remedial, lulus bila Final ulang minimal ${formatScore1(passGrade)}`,
        group: "Remedial",
        width: 148,
        editor: "readonly",
        derive: (_row, value) =>
          remedialResult({ action: text(value("action")), rolePlay: num(value("role_play")), postTest: num(value("post_test")) }, s)
            .status,
        render: (value) =>
          value ? <StatusChip label={String(value)} tone={remedialTone(String(value))} bordered /> : null,
      },
      {
        key: "reported",
        header: "Dilaporkan",
        label: "Hasil remedial sudah dilaporkan",
        group: "Pelaporan",
        width: 100,
        editor: "select",
        options: [{ value: "Ya" }, { value: "Belum" }],
        get: (r) => (r.remedial?.reported === "Ya" || r.remedial?.reported === "Belum" ? r.remedial.reported : null),
        render: (value) =>
          value ? <StatusChip label={String(value)} tone={value === "Ya" ? "good" : "warning"} bordered /> : null,
      },
      {
        key: "notes",
        header: "Catatan",
        group: "Pelaporan",
        width: 240,
        editor: "longtext",
        maxLength: 4000,
        get: (r) => r.remedial?.notes ?? null,
      },
      {
        key: "changed",
        header: "Terakhir diubah lewat",
        width: 232,
        editor: "readonly",
        render: (_value, r) => (r.changed ? <span className="text-xs text-ink-muted">{r.changed}</span> : null),
      },
    );
    return out;
    // settings beyond the three numbers is not read; keying on them keeps columns stable across refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passGrade, weightRolePlay, weightPostTest, showStation]);

  const rowActions = useMemo(
    () => ({
      header: "Aksi",
      width: 84,
      render: (row: RemedialGridRow) =>
        row.remedial ? <RemedialDeleteButton accessKey={accessKey} staffCode={row.code} name={row.name} /> : null,
    }),
    [accessKey],
  );

  const onSaveRow = useCallback(
    async (_key: string, changes: Record<string, CellValue>, row: RemedialGridRow): Promise<SaveRowResult> => {
      const pick = <T,>(field: string, stored: T): T => (field in changes ? (changes[field] as T) : stored);
      const stored = row.remedial;
      const reported = pick<string | null>("reported", stored?.reported ?? null);
      let result: Awaited<ReturnType<typeof saveRemedial>>;
      try {
        result = await saveRemedial(accessKey, {
          staffCode: row.code,
          action: text(pick<CellValue>("action", stored?.action ?? null)),
          remedialOn: text(pick<CellValue>("remedial_on", stored?.remedialOn ?? null)),
          rolePlay: num(pick<CellValue>("role_play", stored?.rolePlay ?? null)),
          postTest: num(pick<CellValue>("post_test", stored?.postTest ?? null)),
          reported: reported === "Ya" || reported === "Belum" ? reported : null,
          notes: text(pick<CellValue>("notes", stored?.notes ?? null)),
        });
      } catch {
        return { ok: false, message: "Koneksi ke server terputus. Isian tetap ada; coba simpan lagi." };
      }
      if (result.ok) return { ok: true };
      const field = result.error.code === "invalid_input" ? result.error.field : undefined;
      const column = field ? COLUMN_OF_FIELD[field] : undefined;
      const message = (field && FIELD_MESSAGE[field]) || result.error.message;
      return { ok: false, message, fieldErrors: column ? { [column]: message } : undefined };
    },
    [accessKey],
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
      rowActions={rowActions}
      confirmClear={CONFIRM_CLEAR}
      emptyState={emptyState}
      phone={phone}
    />
  );
}

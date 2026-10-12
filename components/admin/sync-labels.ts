/** Plain-language names for sync_conflicts rows (docs/SYNC.md, "Resolving conflicts"). */

import { SETTINGS_ENTRIES, SYNC_TABLES } from "@/lib/sync/tables";

export const TABLE_LABEL: Record<string, string> = {
  staff: "SDM",
  weekly_scores: "Penilaian Mingguan",
  bmi_checks: "Cek BMI",
  action_items: "Tindak Lanjut",
  remedials: "Remedial",
  replacements: "Penggantian SDM",
  settings: "Parameter",
  weekly_reports: "Temuan Mingguan",
};

export const RESOLUTION_LABEL: Record<string, string> = {
  "db-wins": "Nilai aplikasi dipakai, Google Sheet ditimpa",
  "sheet-wins": "Nilai Google Sheet dipakai",
  "rejected:invalid_value": "Ditolak: nilai di Google Sheet tidak valid",
  "rejected:required_missing": "Ditolak: isian wajib kosong",
  "rejected:unknown_parent": "Ditolak: ID SDM tidak dikenal",
  "rejected:duplicate_key": "Ditolak: baris ganda",
  "rejected:missing_key": "Ditolak: ID baris kosong",
  "rejected:unknown_setting": "Ditolak: parameter tidak dikenal",
  "rejected:deletes_skipped": "Penghapusan dilewati",
  "rejected:header_error": "Ditolak: judul kolom berubah",
  "rejected:no_sheet_row": "Tidak ada baris untuk data ini di Google Sheet",
  "rejected:incomplete_row": "Ditolak: baris di Google Sheet belum lengkap",
};

/** The replica's column header for a logged column (Parameter: the label of the setting). */
export function columnLabel(table: string, column: string | null, rowKey: string | null): string | null {
  if (column === null) return null;
  if (table === "settings") return SETTINGS_ENTRIES.find((e) => e.key === rowKey)?.label ?? column;
  if (column === "db" || column === "sheet") return column === "db" ? "Penghapusan di aplikasi" : "Penghapusan di Google Sheet";
  const header = SYNC_TABLES.find((t) => t.table === table)?.columns.find((c) => c.db === column)?.header;
  return header ?? column;
}

/** A jsonb cell as text: strings as-is, everything else as compact JSON. */
export function jsonText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

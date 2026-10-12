/**
 * Which tables are replicated where. The replica is the Garuda workbook itself
 * ("Tracker Tindak Lanjut People Development Garuda"): most tables live in its native tabs and layouts
 * (lib/sync/layouts.ts reads/writes them); only `Temuan Mingguan` is a tab the engine owns.
 *
 * Headers are the workbook's own texts (whitespace-insensitive), so a renamed header is detected.
 * Columns not listed here are never read or written: workbook formulas (Final Result, Status, BMI,
 * Kategori, Rata-rata, Sisa Hari, Flag, Final Ulang, ...), and DB-only columns (sort_order, updated_at,
 * updated_by, updated_by_user, updated_by_link, created_at, internal ids).
 *
 * Never synced: share_links, admins, stations (read only, to validate unit codes), sync_* tables.
 */
import {
  ACTION_GROUPS,
  ASPECTS,
  ASSIGNMENT_STATUSES,
  PROGRAMS,
  REMEDIAL_ACTIONS,
  TOUCH_POINTS,
} from "../rules";
import { toDbValue } from "./normalize";
import type { Canon, CanonRow, Column, ColumnType, DataColumn, KvEntry, SyncTable, TableSpec } from "./types";

export const GENDERS = ["L", "P"] as const;
export const REMARKS = ["Passed", "Failed"] as const;
export const ACTION_KINDS = ["Sekali", "Rutin"] as const;
export const ACTION_STATUSES = ["Belum Mulai", "On Progress", "Selesai", "Tertunda"] as const;
export const YA_BELUM = ["Ya", "Belum"] as const;

const text = (): ColumnType => ({ kind: "text" });
const int = (min?: number, max?: number): ColumnType => ({ kind: "int", min, max });
const num = (scale: number, min?: number, max?: number): ColumnType => ({ kind: "numeric", scale, min, max });
const date: ColumnType = { kind: "date" };
const oneOf = (values: readonly string[]): ColumnType => ({ kind: "enum", values });
const station: ColumnType = { kind: "station" };
const score = (): ColumnType => num(2, 0, 100);

function d(db: string, header: string, type: ColumnType, extra: Partial<DataColumn> = {}): DataColumn {
  return { kind: "data", db, header, type, ...extra };
}

/** The four weekly coaching aspects (Log Performa Mingguan H–K, 0–100). */
export const SCORE_COLUMNS = ["score_grooming", "score_knowledge", "score_attitude", "score_communication"];

/**
 * Parameter rows, matched by the label in column B (texts as in scripts/import_xlsx.py
 * PARAMETER_LABELS). "Tanggal acuan (hari ini)" is a TODAY() formula and is not synced.
 */
export const SETTINGS_ENTRIES: KvEntry[] = [
  { key: "week1_start", label: "Tanggal mulai Minggu ke-1 (Senin)", type: date, required: true },
  { key: "weeks", label: "Jumlah minggu pemantauan", type: int(1, 20), required: true },
  { key: "bmi_first_check", label: "Tanggal cek BMI slot 1", type: date, required: true },
  { key: "bmi_interval_days", label: "Interval cek BMI – ada catatan (hari)", type: int(1, 90), required: true },
  { key: "bmi_interval_months", label: "Interval cek BMI – tanpa catatan (bulan)", type: int(1, 12), required: true },
  { key: "bmi_periods", label: "Jumlah slot cek di sheet BMI", type: int(1, 12), required: true },
  { key: "bmi_underweight_below", label: "BMI kategori Kurus jika <", type: num(2, 1, 100), required: true },
  { key: "bmi_normal_max", label: "BMI Normal s.d.", type: num(2, 1, 100), required: true },
  { key: "bmi_overweight_max", label: "BMI Overweight s.d. (di atasnya Obesitas)", type: num(2, 1, 100), required: true },
  { key: "pass_grade", label: "Passing grade (skor ≥)", type: num(2, 0, 100), required: true },
  { key: "weight_role_play", label: "Bobot Role Play di Final Result", type: num(4, 0, 1), required: true },
  { key: "weight_post_test", label: "Bobot Post-Test di Final Result", type: num(4, 0, 1), required: true },
  { key: "target_overweight_max", label: "Target proporsi BMI overweight (maks.)", type: num(4, 0, 1), required: true },
  { key: "target_overweight_months", label: "Jangka waktu target BMI (bulan)", type: int(1, 36), required: true },
  { key: "target_knowledge", label: "Target ketepatan jawaban Product Knowledge", type: num(4, 0, 1), required: true },
  { key: "target_interactive", label: "Target skor Interactive Communicating", type: num(4, 0, 1), required: true },
  { key: "target_coverage", label: "Target cakupan coaching (jumlah frontliner)", type: int(1), required: true },
  { key: "coverage_done", label: "Frontliner sudah coaching (update manual)", type: int(0), required: true },
  { key: "target_pass_rate", label: "Target kelulusan peserta IULS/RUST setelah remedial", type: num(4, 0, 1), required: true },
  { key: "replacement_deadline", label: "Batas waktu penggantian SDM", type: date, required: true },
];

/** Cross-field CHECKs on public.settings; a violating sheet edit would fail the whole DB write. */
function validateSettings(v: Record<string, Canon>): string | null {
  const n = (k: string) => (typeof v[k] === "number" ? (v[k] as number) : null);
  const [under, normal, over] = [n("bmi_underweight_below"), n("bmi_normal_max"), n("bmi_overweight_max")];
  if (under !== null && normal !== null && over !== null && !(under <= normal && normal <= over)) {
    return "Batas BMI harus berurutan: Kurus < ≤ Normal s.d. ≤ Overweight s.d.";
  }
  return null;
}

const settings: TableSpec = {
  table: "settings",
  tab: "Parameter",
  layout: "parameter",
  key: ["key"],
  kv: { entries: SETTINGS_ENTRIES, validate: validateSettings },
  appendMode: "none",
  noRowMessage: "Baris parameter ini tidak ditemukan di tab Parameter (kolom B). Nilai database dipertahankan.",
  columns: [d("key", "Parameter", text()), d("value", "Nilai", text())],
};

/**
 * Master SDM (data rows 5..304). A row with ID SDM but no name is an empty slot; a row with neither is
 * free for a new staff member. bmi_has_note and bmi_note live in "Cek BMI 2 Mingguan" (G and AS) on
 * the row below (Cek BMI row = Master row + 1).
 */
const staff: TableSpec = {
  table: "staff",
  tab: "Master SDM",
  layout: "master-sdm",
  key: ["code"],
  emptyRowIsAbsent: true,
  absentUnless: ["name"],
  appendMode: "blank-row",
  noRowMessage: "Master SDM penuh: tidak ada baris kosong (ID SDM dan Nama kosong) untuk SDM ini. Tambahkan baris di workbook.",
  deleteMode: "clear",
  clearKeyOnDelete: true,
  columns: [
    d("code", "ID SDM", text()),
    d("program", "Program", oneOf(PROGRAMS)),
    d("provider", "Provider", text()),
    d("station", "Unit", station, { required: true }),
    d("name", "Nama Petugas", text(), { required: true }),
    d("employee_no", "Employee Number", text()),
    d("gender", "L/P", oneOf(GENDERS)),
    d("touch_point", "Touch Point", oneOf(TOUCH_POINTS)),
    d("role_play", "Role Play", score()),
    d("post_test", "Post-Test", score()),
    d("report_remark", "Remark di Laporan", oneOf(REMARKS)),
    d("assignment_status", "Status Penugasan", oneOf(ASSIGNMENT_STATUSES), { required: true, defaultValue: "Aktif" }),
    d("feedback", "Evaluation Feedback", text()),
    d("notes", "Catatan", text()),
    // These two live in tab "Cek BMI 2 Mingguan" (G, AS), on the row below the Master row.
    d("bmi_has_note", "Ada Catatan BMI", { kind: "bool", yes: "Ya", no: "Tidak" }),
    d("bmi_note", "Catatan Program Kebugaran", text()),
  ],
};

const weeklyScores: TableSpec = {
  table: "weekly_scores",
  tab: "Log Performa Mingguan",
  layout: "log-performa",
  key: ["staff_code", "week"],
  emptyRowIsAbsent: true,
  appendMode: "blank-row",
  noRowMessage: "Log Performa Mingguan penuh: tidak ada baris kosong untuk nilai ini. Tambahkan baris (dengan rumusnya) di workbook.",
  deleteMode: "clear",
  parent: { column: "staff_code", table: "staff" },
  columns: [
    d("week", "Minggu Ke", int(1, 20)),
    d("staff_code", "ID SDM", text()),
    d("touch_point", "Touch Point", oneOf(TOUCH_POINTS)),
    d("score_grooming", "A Grooming & Appearance", score()),
    d("score_knowledge", "B Product Knowledge", score()),
    d("score_attitude", "C Attitude & Behaviour", score()),
    d("score_communication", "D Communication Skill", score()),
    d("gap_topic", "Topik Gap Utama", text()),
    d("observer", "Observer / Coach", text()),
    d("coaching_notes", "Catatan Coaching", text()),
  ],
};

/** Wide in the workbook (one row per staff, 6 slots side by side); long in the DB. */
const bmiChecks: TableSpec = {
  table: "bmi_checks",
  tab: "Cek BMI 2 Mingguan",
  layout: "cek-bmi",
  key: ["staff_code", "period"],
  emptyRowIsAbsent: true,
  absentUnless: ["height_cm", "weight_kg"],
  appendMode: "none",
  noRowMessage: 'Tidak ada tempat untuk cek ini di tab "Cek BMI 2 Mingguan" (slot di luar kolom yang ada, atau ID SDM tidak ada).',
  deleteMode: "clear",
  parent: { column: "staff_code", table: "staff" },
  columns: [
    d("staff_code", "ID SDM", text()),
    d("period", "Cek Ke", int(1, 12)),
    d("check_date", "Tgl Cek", date),
    d("height_cm", "Tinggi (cm)", num(1, 120, 210), { required: true }),
    d("weight_kg", "Berat (kg)", num(1, 30, 200), { required: true }),
  ],
};

/** National action items. `Batas Waktu` may be a formula (EDATE...): that cell is skipped. */
const actionItems: TableSpec = {
  table: "action_items",
  tab: "Tindak Lanjut",
  layout: "tindak-lanjut",
  key: ["code"],
  emptyRowIsAbsent: true,
  appendMode: "blank-row",
  noRowMessage: "Tindak Lanjut penuh: tidak ada baris kosong untuk butir ini. Tambahkan baris (dengan rumusnya) di workbook.",
  deleteMode: "clear",
  columns: [
    d("code", "ID", text()),
    d("group_name", "Kelompok", oneOf(ACTION_GROUPS), { required: true }),
    d("aspect", "Aspek", oneOf(ASPECTS)),
    d("root_cause", "Akar Masalah / Temuan", text()),
    d("action", "Tindakan / Inisiatif", text()),
    d("target", "Target / KPI", text()),
    d("kind", "Jenis", oneOf(ACTION_KINDS)),
    d("schedule", "Jadwal", text()),
    d("due_date", "Batas Waktu", date),
    d("pic", "PIC", text()),
    d("status", "Status", oneOf(ACTION_STATUSES), { required: true, defaultValue: "Belum Mulai" }),
    // Sheet holds a fraction (0..1, formatted 0%); the DB holds 0..100. Scaled by the layout.
    d("progress", "% Progres", int(0, 100), { required: true, defaultValue: 0 }),
    d("updated_on", "Tgl Update", date),
    d("evidence", "Realisasi / Bukti", text()),
    d("kps_notes", "Catatan Garuda / KPS", text()),
    d("source", "Sumber", text()),
  ],
};

/** One row per participant in remedial (UNIQUE staff_code). A row is a record as long as ID SDM is filled. */
const remedials: TableSpec = {
  table: "remedials",
  tab: "Remedial",
  layout: "remedial",
  key: ["staff_code"],
  appendMode: "blank-row",
  noRowMessage: "Tab Remedial penuh: tidak ada baris kosong untuk peserta ini. Tambahkan baris (dengan rumusnya) di workbook.",
  deleteMode: "clear",
  clearKeyOnDelete: true,
  parent: { column: "staff_code", table: "staff" },
  columns: [
    d("staff_code", "ID SDM", text()),
    d("action", "Tindakan Remedial", oneOf(REMEDIAL_ACTIONS)),
    d("remedial_on", "Tgl Remedial", date),
    d("role_play", "Role Play Ulang", score()),
    d("post_test", "Post-Test Ulang", score()),
    d("reported", "Dilaporkan ke Garuda", oneOf(YA_BELUM)),
    d("notes", "Catatan", text()),
  ],
};

/** Rows 5..44 are pre-numbered slots. `ID Sistem` and `ID SDM` are added by the engine (P, Q). */
const replacements: TableSpec = {
  table: "replacements",
  tab: "Penggantian SDM",
  layout: "penggantian",
  key: ["id"],
  generatedKey: true,
  emptyRowIsAbsent: true,
  adoptBy: ["station", "replaced_name"],
  refs: [{ column: "staff_code", table: "staff" }],
  appendMode: "blank-row",
  noRowMessage: "Penggantian SDM penuh: tidak ada baris kosong untuk data ini. Tambahkan baris (dengan rumusnya) di workbook.",
  deleteMode: "clear",
  columns: [
    d("id", "ID Sistem", int(1), { hidden: true }),
    d("program", "Program", oneOf(PROGRAMS)),
    d("station", "Unit", station),
    d("replaced_name", "Nama SDM Diganti", text(), { required: true }),
    d("reason", "Alasan / Dasar", text()),
    d("withdrawn_on", "Tgl Ditarik", date),
    d("replacement_name", "Nama SDM Pengganti", text()),
    d("effective_on", "Tgl Efektif", date),
    d("training_on", "Tgl Training", date),
    d("post_test", "Post-Test", score()),
    d("final_result", "Final Result", score()),
    d("reported", "Dilaporkan ke Garuda", oneOf(YA_BELUM)),
    d("notes", "Catatan", text()),
    d("staff_code", "ID SDM", text()),
  ],
};

/** The only tab the engine creates (row-1 header). One findings text per week and link scope. */
const weeklyReports: TableSpec = {
  table: "weekly_reports",
  tab: "Temuan Mingguan",
  key: ["week", "scope"],
  columns: [
    d("week", "Minggu Ke", int(1, 20)),
    d("scope", "Lingkup", { kind: "station", kps: true }),
    d("findings", "Temuan", text()),
  ],
};

/** Processing order: parents before children. Deletes run in reverse. */
export const SYNC_TABLES: TableSpec[] = [
  settings,
  staff,
  weeklyScores,
  bmiChecks,
  actionItems,
  remedials,
  replacements,
  weeklyReports,
];

/** Tabs the engine must never touch. */
export const UNTOUCHED_TABS = [
  "Petunjuk",
  "Dashboard",
  "Laporan Mingguan",
  "Rekap Performa",
  "Data Coaching",
  "Data Training",
];

export function specFor(table: SyncTable, specs: TableSpec[] = SYNC_TABLES): TableSpec {
  const s = specs.find((t) => t.table === table);
  if (!s) throw new Error(`unknown sync table ${table}`);
  return s;
}

/**
 * The same tables as plain row-1 tabs (no workbook layout, rows appended and deleted normally).
 * Used by the merge-engine tests; data semantics (keys, types, absence rules) are unchanged.
 */
export function rowOneSpecs(specs: TableSpec[] = SYNC_TABLES): TableSpec[] {
  return specs.map((s) => ({ ...s, layout: undefined, appendMode: undefined, deleteMode: undefined, clearKeyOnDelete: undefined }));
}

export const dataColumns = (spec: TableSpec): DataColumn[] => spec.columns;
export const nonKeyDataColumns = (spec: TableSpec): DataColumn[] =>
  dataColumns(spec).filter((c) => !spec.key.includes(c.db));
export const columnId = (c: Column): string => c.db;

/** A canonical row as the database takes it (e.g. "Ya"/"Tidak" -> true/false). */
export function toDbRow(spec: TableSpec, row: CanonRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const c = spec.columns.find((x) => x.db === k);
    out[k] = c ? toDbValue(v, c.type) : v;
  }
  return out;
}

/*
 * Row model and pure view logic of the Cek BMI tracker (no React, no server code), covered
 * by tracker-model.test.ts. Formulas stay in lib/rules; this only shapes rows, filters
 * them, counts them and applies an edit to a row so the screen can show a save at once.
 */
import { bmiSummary, TOUCH_POINTS, type BmiCheckRow, type BmiSummary, type Settings } from "@/lib/rules";
import type { CheckField } from "./entry";

/** One stored check: the database refuses a check without both height and weight. */
export type BmiStoredCheck = {
  date: string | null;
  heightCm: number;
  weightKg: number;
  /** Komitmen/Target: what was typed for a check that is not Normal, or "Sudah Ideal" for a Normal one. */
  commitment: string | null;
};

/** One staff member as the tracker needs them (plain data, sent from the server screen). */
export type BmiTrackerRow = {
  /** The staff code (ID SDM): the key of every save, never shown in a branch account's view. */
  code: string;
  /**
   * What the first identity column shows and the search matches: the staff code, or the employee
   * number (No Pegawai) in a branch account's view. Empty means the staff member has none.
   */
  displayId?: string;
  /** No Pegawai as stored, for the profile form. Not shown in the table of a link or the owner. */
  employeeNo?: string | null;
  name: string;
  /** Station code, shown in the Unit column. */
  station: string | null;
  /** Touch Point: one of the five standard values or any other text the owner entered. */
  touchPoint: string | null;
  gender: string | null;
  feedback: string | null;
  remarks: string | null;
  /** Ada Catatan BMI: true Ya, false Tidak, null not filled in. */
  hasNote: boolean | null;
  fitnessNote: string | null;
  assignmentStatus: string | null;
  /** "tautan ini, 8 Okt 07.55": who last changed one of this person's checks. */
  changed: string | null;
  /** Index 0 is period 1. null when that period has no check. */
  checks: Array<BmiStoredCheck | null>;
};

export type BmiRowView = { row: BmiTrackerRow; summary: BmiSummary };

export function summarizeRow(row: BmiTrackerRow, settings: Settings, today: string): BmiSummary {
  const checks: BmiCheckRow[] = [];
  row.checks.forEach((check, i) => {
    if (check) {
      checks.push({
        staffCode: row.code,
        period: i + 1,
        checkDate: check.date,
        heightCm: check.heightCm,
        weightKg: check.weightKg,
      });
    }
  });
  return bmiSummary(checks, settings, today);
}

const summaryCache = new WeakMap<BmiTrackerRow, { settings: Settings; today: string; summary: BmiSummary }>();

/**
 * summarizeRow, remembered per row object: an edit replaces only its own row, so the other
 * 700 rows keep their summary (and their identity, which keeps the table rows from redrawing).
 */
export function summaryOf(row: BmiTrackerRow, settings: Settings, today: string): BmiSummary {
  const hit = summaryCache.get(row);
  if (hit && hit.settings === settings && hit.today === today) return hit.summary;
  const summary = summarizeRow(row, settings, today);
  summaryCache.set(row, { settings, today, summary });
  return summary;
}

/** True when period `period` (1-based) holds a complete check, so it has a BMI. */
export function isCheckedIn(summary: BmiSummary, period: number): boolean {
  return summary.periods[period - 1]?.bmi != null;
}

export type StatusFilter = "all" | "late" | "checked" | "pending" | "due";

export const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Semua status" },
  { value: "late", label: "Terlambat cek" },
  { value: "checked", label: "Sudah dicek" },
  { value: "pending", label: "Belum dicek" },
  { value: "due", label: "Segera dijadwalkan" },
];

export function isStatusFilter(value: string): value is StatusFilter {
  return STATUS_FILTERS.some((f) => f.value === value);
}

/** The id a row shows: its displayId when the screen sets one, otherwise the staff code. */
export function idOf(row: Pick<BmiTrackerRow, "code" | "displayId">): string {
  return row.displayId ?? row.code;
}

export type RowFilters = {
  /** Name or ID (No Pegawai in a branch account's view), any case. */
  query: string;
  status: StatusFilter;
  /** "" is every touch point. */
  touchPoint: string;
  /** The chosen period, 1-based: "Sudah dicek" and "Belum dicek" are about this one. */
  period: number;
};

/** Rows that pass the search, the status and the touch point filter, in their original order. */
export function filterViews(views: readonly BmiRowView[], f: RowFilters): BmiRowView[] {
  const query = f.query.trim().toLowerCase();
  return views.filter(({ row, summary }) => {
    if (query && !`${idOf(row)} ${row.name}`.toLowerCase().includes(query)) return false;
    if (f.touchPoint && row.touchPoint?.trim() !== f.touchPoint) return false;
    if (f.status === "late" && summary.scheduleStatus !== "Terlambat cek") return false;
    if (f.status === "due" && summary.scheduleStatus !== "Cek ≤ 7 hari") return false;
    const checked = isCheckedIn(summary, f.period);
    if (f.status === "checked" && !checked) return false;
    if (f.status === "pending" && checked) return false;
    return true;
  });
}

/**
 * The Touch Point filter's choices: the five standard values in their usual order, then any other
 * value found in the data (free text from the owner), sorted. Empty while nobody has a touch point,
 * so the filter is then not shown.
 */
export function touchPointsOf(rows: readonly Pick<BmiTrackerRow, "touchPoint">[]): string[] {
  const used = new Set<string>();
  for (const { touchPoint } of rows) {
    const value = touchPoint?.trim();
    if (value) used.add(value);
  }
  if (used.size === 0) return [];
  const standard: readonly string[] = TOUCH_POINTS;
  const other = [...used].filter((value) => !standard.includes(value)).sort((a, b) => a.localeCompare(b));
  return [...standard, ...other];
}

export type TrackerMetrics = {
  total: number;
  /** Checked in the chosen period. */
  checked: number;
  /** checked / total as a whole percentage, 0 when there is nobody. */
  checkedPct: number;
  late: number;
  /** Latest BMI category is Overweight or Obesitas. */
  aboveNormal: number;
};

export function trackerMetrics(views: readonly BmiRowView[], period: number): TrackerMetrics {
  let checked = 0;
  let late = 0;
  let aboveNormal = 0;
  for (const { summary } of views) {
    if (isCheckedIn(summary, period)) checked += 1;
    if (summary.scheduleStatus === "Terlambat cek") late += 1;
    if (summary.latestCategory === "Overweight" || summary.latestCategory === "Obesitas") aboveNormal += 1;
  }
  const total = views.length;
  return { total, checked, checkedPct: total === 0 ? 0 : Math.round((checked / total) * 100), late, aboveNormal };
}

/** The cell a person clicked to change. */
export type EditTarget =
  | { kind: "hasNote"; code: string }
  | { kind: "fitnessNote"; code: string }
  | { kind: "check"; code: string; period: number; field: CheckField }
  | { kind: "commitment"; code: string; period: number };

export type RowEdit =
  | { type: "check"; code: string; period: number; check: BmiStoredCheck | null }
  | {
      type: "profile";
      code: string;
      patch: Partial<Pick<BmiTrackerRow, "hasNote" | "fitnessNote" | "name" | "touchPoint" | "gender" | "employeeNo" | "displayId">>;
    };

/** The rows with one edit applied (a new array; only the edited row is a new object). */
export function applyEdit(rows: readonly BmiTrackerRow[], edit: RowEdit): BmiTrackerRow[] {
  return rows.map((row) => {
    if (row.code !== edit.code) return row;
    if (edit.type === "profile") return { ...row, ...edit.patch };
    const checks = [...row.checks];
    checks[edit.period - 1] = edit.check;
    return { ...row, checks };
  });
}

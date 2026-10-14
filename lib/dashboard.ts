/*
 * Beranda: this week's work per station, the station table (worst first) and the programme
 * targets. Built only from lib/aggregate and lib/rules, so every number agrees with the
 * other screens. Pure: "today" is an argument, links are { sheet, query } and the screen
 * turns them into hrefs(access).
 */
import {
  TOTAL,
  dashboard,
  staffDerived,
  type Dashboard,
  type KpiRow,
  type KpiStatus,
  type StaffDerived,
  type TrackerData,
} from "./aggregate";
import { formatHariTanggal, type IsoDate } from "./dates";
import { formatDecimal } from "./format";
import { bmiCheckDate, coachingAvg, sameText, weekEnd, weekOfDate, type Settings } from "./rules";
import type { SheetKey } from "./workspace/access";

export type DashboardLink = { sheet: SheetKey; query?: Record<string, string | number | null> };

export type Phase = "before" | "during" | "after";

/** One station (or TOTAL) in the Beranda station table. */
export type StationRow = {
  station: string;
  /** Named staff still on duty. */
  onDuty: number;
  /** On-duty staff with a score in the running week; null before the programme. */
  assessed: number | null;
  /** On-duty staff measured in the current BMI slot; null before the first check date. */
  bmiChecked: number | null;
  /** On-duty staff past their next BMI check date. */
  lateBmi: number;
  /** Failed in the training report (all named staff). */
  failed: number;
  /** Failed without a remedial action. */
  failedNoRemedial: number;
  /** On-duty staff whose "ada catatan BMI" is still empty. */
  bmiNoteMissing: number;
  links: {
    station: DashboardLink;
    performa: DashboardLink;
    bmi: DashboardLink;
    remedial: DashboardLink;
  };
};

/** One programme target, with a plain label. Values are fractions 0..1. */
export type TargetRow = {
  key: KpiRow["key"];
  label: string;
  baseline: number | null;
  /** "< 20%", "≥ 100%", or "Di atas posisi awal". */
  target: string;
  actual: number | null;
  status: KpiStatus;
};

export type BerandaSummary = {
  asOf: IsoDate;
  phase: Phase;
  /** Week the "this week" numbers refer to (the last week after the programme), or null before it. */
  week: number | null;
  /** Latest BMI slot whose planned date has come, or null before the first check. */
  bmiPeriod: number | null;
  /** lib/aggregate dashboard() for the same data. */
  dash: Dashboard;
  /** One row per station in view, worst first. */
  stations: StationRow[];
  /** All stations in view together (TOTAL). */
  total: StationRow;
  /** National action items flagged OVERDUE. */
  actionOverdue: number;
  targets: TargetRow[];
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function hasText(v: string | null | undefined): boolean {
  return v != null && v.trim() !== "";
}

/** Staff still on duty: withdrawn staff are no longer assessed or measured. */
export function isOnDuty(assignmentStatus: string | null | undefined): boolean {
  return !sameText(assignmentStatus, "Ditarik dari layanan");
}

/** Fraction 0..1 as "37,3%" (one decimal, dropped when whole: "100%"). */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null) return "";
  return `${formatDecimal(value * 100, 0, digits)}%`;
}

const DIRECTION_TEXT: Record<"<" | ">" | ">=", string> = { "<": "<", ">": ">", ">=": "≥" };

export function targetText(row: Pick<KpiRow, "direction" | "target">): string | null {
  if (row.direction === "baseline" || row.target === null) return null;
  return `Target ${DIRECTION_TEXT[row.direction]} ${formatPercent(row.target)}`;
}

export function phaseOf(s: Settings, today: IsoDate): Phase {
  if (today < s.week1Start) return "before";
  if (today > weekEnd(s.weeks, s)) return "after";
  return "during";
}

/** Monitoring week shown by default: this week, week 1 before the programme, the last week after it. */
export function defaultWeek(s: Settings, today: IsoDate): number {
  const current = weekOfDate(today, s);
  if (current !== null) return current;
  return today < s.week1Start ? 1 : s.weeks;
}

/** `?minggu=` as a week of the programme, or the default week. */
export function parseWeek(raw: string | string[] | undefined, s: Settings, today: IsoDate): number {
  const text = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  const n = text && /^\d{1,2}$/.test(text) ? Number(text) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= s.weeks ? n : defaultWeek(s, today);
}

/** Latest BMI slot whose planned date is on or before today, or null. */
export function currentBmiPeriod(s: Settings, today: IsoDate): number | null {
  let period: number | null = null;
  for (let p = 1; p <= s.bmiPeriods; p++) {
    if (bmiCheckDate(p, s) <= today) period = p;
  }
  return period;
}

/** Failed in the training report and no remedial action recorded yet. */
export function isFailedWithoutRemedial(d: StaffDerived): boolean {
  return d.baseline.status === "Failed" && !hasText(d.remedial?.row.action);
}

// ---------------------------------------------------------------------------
// Station rows
// ---------------------------------------------------------------------------

function scoredIn(data: TrackerData, week: number): Set<string> {
  return new Set(data.weeklyScores.filter((r) => r.week === week && coachingAvg(r) !== null).map((r) => r.staffCode));
}

function stationRow(
  derived: readonly StaffDerived[],
  key: string,
  scored: Set<string> | null,
  week: number | null,
  bmiPeriod: number | null,
): StationRow {
  const all = key === TOTAL;
  const rows = derived.filter((d) => hasText(d.staff.name) && (all || sameText(d.staff.station, key)));
  const onDuty = rows.filter((d) => isOnDuty(d.staff.assignmentStatus));
  const station = all ? null : key;
  const q = (extra: Record<string, string | number | null> = {}) => ({ stasiun: station, ...extra });

  return {
    station: key,
    onDuty: onDuty.length,
    assessed: scored === null ? null : onDuty.filter((d) => scored.has(d.staff.code)).length,
    bmiChecked:
      bmiPeriod === null ? null : onDuty.filter((d) => (d.bmi.periods[bmiPeriod - 1]?.bmi ?? null) !== null).length,
    lateBmi: onDuty.filter((d) => d.bmi.scheduleStatus === "Terlambat cek").length,
    failed: rows.filter((d) => d.baseline.status === "Failed").length,
    failedNoRemedial: rows.filter(isFailedWithoutRemedial).length,
    bmiNoteMissing: onDuty.filter((d) => d.staff.bmiHasNote == null).length,
    links: {
      station: { sheet: "dashboard", query: q() },
      performa: { sheet: "performa", query: q({ minggu: week ?? 1 }) },
      bmi: { sheet: "bmi", query: q(bmiPeriod ? { periode: bmiPeriod } : {}) },
      remedial: { sheet: "remedial", query: q({ status: "Belum dijadwalkan" }) },
    },
  };
}

/** Share of this week's entries still open (scores and BMI checks), 0..1; 0 when nothing is due. */
function openShare(r: StationRow): number {
  let due = 0;
  let open = 0;
  if (r.assessed !== null) {
    due += r.onDuty;
    open += r.onDuty - r.assessed;
  }
  if (r.bmiChecked !== null) {
    due += r.onDuty;
    open += r.onDuty - r.bmiChecked;
  }
  return due === 0 ? 0 : open / due;
}

/**
 * Worst first: most exceptions (late BMI checks + Failed without remedial), then the largest
 * share of this week's scores and checks still open, then the station order.
 */
export function worstFirst(rows: readonly StationRow[]): StationRow[] {
  return rows
    .map((r, i) => ({ r, i, issues: r.lateBmi + r.failedNoRemedial, open: openShare(r) }))
    .sort((a, b) => b.issues - a.issues || b.open - a.open || a.i - b.i)
    .map(({ r }) => r);
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

const TARGET_LABELS: Record<KpiRow["key"], string> = {
  coverage: "Cakupan coaching",
  overweight: "BMI overweight + obesitas",
  knowledge: "Product Knowledge",
  interactive: "Interactive Communicating",
  passRate: "Lulus coaching mingguan",
  iuls: "Kelulusan IULS",
  rust: "Kelulusan RUST",
};

export function targetRows(kpis: readonly KpiRow[]): TargetRow[] {
  return kpis.map((k) => ({
    key: k.key,
    label: TARGET_LABELS[k.key],
    baseline: k.baseline,
    target: targetText(k)?.replace(/^Target /, "") ?? "Di atas posisi awal",
    actual: k.actual,
    status: k.status,
  }));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Beranda numbers for `stations` (all for KPS / the owner, one for a station link).
 * `data` must already be limited to that scope (lib/workspace trackerData).
 */
export function berandaSummary(data: TrackerData, today: IsoDate, stations: readonly string[]): BerandaSummary {
  const s = data.settings;
  const phase = phaseOf(s, today);
  const week = weekOfDate(today, s) ?? (phase === "after" ? s.weeks : null);
  const bmiPeriod = currentBmiPeriod(s, today);
  const dash = dashboard(data, today);
  const derived = staffDerived(data, today);
  const scored = week === null ? null : scoredIn(data, week);
  const actions = dash.actionByGroup.find((r) => r.key === TOTAL);

  return {
    asOf: today,
    phase,
    week,
    bmiPeriod,
    dash,
    stations: worstFirst(stations.map((code) => stationRow(derived, code, scored, week, bmiPeriod))),
    total: stationRow(derived, TOTAL, scored, week, bmiPeriod),
    actionOverdue: actions?.overdue ?? 0,
    targets: targetRows(dash.kpis),
  };
}

// ---------------------------------------------------------------------------
// To-do list (station link, or KPS looking at one station)
// ---------------------------------------------------------------------------

export type TodoState = "todo" | "done" | "later";

export type TodoItem = {
  key: "penilaian" | "bmi" | "catatan-bmi" | "remedial" | "temuan";
  title: string;
  /** Counts in words: "2 dari 12 SDM belum dinilai". */
  detail: string;
  state: TodoState;
  /** Staff late for their BMI check (shown as a critical label); 0 otherwise. */
  late: number;
  /** Button label, naming the object. */
  action: string;
  link: DashboardLink;
};

/**
 * This week's work for one station row. Before week 1 the list says what to prepare.
 * `findingsWritten`: the station's findings for the running week exist.
 */
export function stationTodo(
  summary: Pick<BerandaSummary, "phase" | "week" | "bmiPeriod">,
  row: StationRow,
  s: Settings,
  findingsWritten: boolean,
): TodoItem[] {
  const station = row.station === TOTAL ? null : row.station;
  const q = (extra: Record<string, string | number | null> = {}) => ({ stasiun: station, ...extra });
  const items: TodoItem[] = [];

  const remedial: TodoItem = {
    key: "remedial",
    title: "Remedial belum dijadwalkan",
    detail:
      row.failed === 0
        ? "Tidak ada peserta Failed"
        : row.failedNoRemedial === 0
          ? `Semua ${row.failed} peserta Failed sudah dijadwalkan`
          : `${row.failedNoRemedial} dari ${row.failed} peserta Failed`,
    state: row.failedNoRemedial > 0 ? "todo" : "done",
    late: 0,
    action: "Jadwalkan remedial",
    link: row.links.remedial,
  };

  const bmiNote: TodoItem = {
    key: "catatan-bmi",
    title: "Catatan BMI",
    detail:
      row.bmiNoteMissing === 0
        ? `Semua ${row.onDuty} SDM sudah ditandai`
        : `${row.bmiNoteMissing} dari ${row.onDuty} SDM belum ditandai`,
    state: row.bmiNoteMissing > 0 ? "todo" : "done",
    late: 0,
    action: "Lengkapi catatan BMI",
    link: { sheet: "bmi", query: q() },
  };

  if (summary.phase === "before" || summary.week === null) {
    items.push(bmiNote, remedial);
    items.push({
      key: "penilaian",
      title: "Penilaian Minggu ke-1",
      detail: `Mulai ${formatHariTanggal(s.week1Start)}`,
      state: "later",
      late: 0,
      action: "Buka penilaian",
      link: { sheet: "performa", query: q({ minggu: 1 }) },
    });
    items.push({
      key: "bmi",
      title: "BMI Cek ke-1",
      detail: `Mulai ${formatHariTanggal(s.bmiFirstCheck)}`,
      state: "later",
      late: 0,
      action: "Buka cek BMI",
      link: { sheet: "bmi", query: q({ periode: 1 }) },
    });
    return items;
  }

  const week = summary.week;
  const assessed = row.assessed ?? 0;
  items.push({
    key: "penilaian",
    title: `Penilaian Minggu ke-${week}`,
    detail:
      assessed >= row.onDuty
        ? `Semua ${row.onDuty} SDM sudah dinilai`
        : `${row.onDuty - assessed} dari ${row.onDuty} SDM belum dinilai`,
    state: assessed >= row.onDuty ? "done" : "todo",
    late: 0,
    action: "Isi penilaian",
    link: row.links.performa,
  });

  if (summary.bmiPeriod === null || row.bmiChecked === null) {
    items.push({
      key: "bmi",
      title: "BMI Cek ke-1",
      detail: `Mulai ${formatHariTanggal(s.bmiFirstCheck)}`,
      state: "later",
      late: row.lateBmi,
      action: "Buka cek BMI",
      link: { sheet: "bmi", query: q({ periode: 1 }) },
    });
  } else {
    const done = row.bmiChecked >= row.onDuty && row.lateBmi === 0;
    items.push({
      key: "bmi",
      title: `BMI Cek ke-${summary.bmiPeriod}`,
      detail: `${row.bmiChecked} dari ${row.onDuty} SDM sudah dicek`,
      state: done ? "done" : "todo",
      late: row.lateBmi,
      action: "Catat cek BMI",
      link: row.links.bmi,
    });
  }

  if (row.bmiNoteMissing > 0) items.push(bmiNote);
  items.push(remedial);
  items.push({
    key: "temuan",
    title: `Temuan Minggu ke-${week}`,
    detail: findingsWritten ? "Sudah ditulis" : "Belum ditulis",
    state: findingsWritten ? "done" : "todo",
    late: 0,
    action: "Tulis temuan",
    link: { sheet: "laporan", query: q({ minggu: week }) },
  });
  return items;
}

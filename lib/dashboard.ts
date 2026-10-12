/*
 * Dashboard parts (docs/UX.md §3) for the Garuda programme: the KPI tiles (slide 15 targets
 * against the PDF baseline, plus the work of the running week) and the per-station
 * comparison. Built only from lib/aggregate and lib/rules, so every number agrees with the
 * workbook tables. Pure: "today" is an argument, links are { sheet, query } and the screen
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
import { formatHariTanggal, formatTanggal, type IsoDate } from "./dates";
import { formatDecimal } from "./format";
import {
  bmiCheckDate,
  coachingAvg,
  isOverweight,
  sameText,
  startsWithText,
  weekEnd,
  weekOfDate,
  type Settings,
} from "./rules";
import type { SheetKey } from "./workspace/access";

export type DashboardLink = { sheet: SheetKey; query?: Record<string, string | number | null> };

export type Tone = "neutral" | "good" | "warning" | "critical";

export type TileKey =
  | "coverage"
  | "overweight"
  | "knowledge"
  | "interactive"
  | "kelulusan"
  | "tindak-lanjut"
  | "dinilai"
  | "bmi-terlambat"
  | "tanpa-remedial";

export type Tile = {
  key: TileKey;
  label: string;
  /** "percent": value is a fraction 0..1; "count": value is a number of items or staff. */
  format: "percent" | "count";
  /** null: nothing to measure yet; `note` says why. */
  value: number | null;
  /** Denominator for "n dari m" (count tiles only). */
  total: number | null;
  /** Target in words, e.g. "Target < 20%". */
  target: string | null;
  /** PDF baseline in words, e.g. "Baseline PDF 37,3%". */
  baseline: string | null;
  /** lib/aggregate KPI status, when the tile is a slide-15 KPI. */
  status: KpiStatus | null;
  tone: Tone;
  /** The comparison basis in words, always shown. */
  basis: string;
  /** Second line under the number, e.g. "IULS 84% · RUST 46%". */
  detail?: string;
  /** Shown instead of the number while value is null. */
  note?: string;
  link: DashboardLink;
};

export type StationComparisonRow = {
  station: string;
  staffCount: number;
  /** Staff on duty with a score in the week; value null before the programme. */
  assessed: { value: number | null; total: number };
  score: { current: number | null; baseline: number | null; gain: number | null };
  /** Staff with at least one weekly score / of them Lulus on their latest score. */
  rekap: { assessed: number; lulus: number };
  bmi: {
    /** Measured in the current BMI slot; null before the first check date. */
    checkedThisPeriod: number | null;
    everChecked: number;
    overweight: number;
    /** Overweight + obesitas ÷ staff ever checked, 0..1. */
    pctOverweight: number | null;
    late: number;
  };
  training: { passed: number; failed: number; remedialPassed: number; failedNoRemedial: number; beda: number };
  replacements: number;
  links: {
    station: DashboardLink;
    performa: DashboardLink;
    rekap: DashboardLink;
    bmi: DashboardLink;
    sdm: DashboardLink;
    remedial: DashboardLink;
    penggantian: DashboardLink;
  };
};

export type Phase = "before" | "during" | "after";

export type DashboardSummary = {
  asOf: IsoDate;
  phase: Phase;
  /** Week the "this week" numbers refer to (the last week after the programme), or null before it. */
  week: number | null;
  /** Latest BMI slot whose planned date has come, or null before the first check. */
  bmiPeriod: number | null;
  /** lib/aggregate dashboard() for the same data. */
  dash: Dashboard;
  /** Per-staff values, shared with the attention list. */
  derived: StaffDerived[];
  /** Slide-15 targets (5 tiles). */
  targets: Tile[];
  /** Work of the running week (4 tiles). */
  work: Tile[];
  /** One row per station in `stations` order. */
  comparison: StationComparisonRow[];
  /** All stations together (null when only one station is in view). */
  comparisonTotal: StationComparisonRow | null;
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

export function toneForStatus(status: KpiStatus | null): Tone {
  if (status === "Tercapai" || status === "Di atas baseline") return "good";
  if (status === "Belum tercapai" || status === "Di bawah baseline") return "warning";
  return "neutral";
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
// Tiles
// ---------------------------------------------------------------------------

function kpiTile(
  row: KpiRow,
  key: TileKey,
  label: string,
  link: DashboardLink,
  note: string,
  basis = row.basis,
): Tile {
  return {
    key,
    label,
    format: "percent",
    value: row.actual,
    total: null,
    target: targetText(row),
    baseline: row.baseline === null ? null : `Baseline PDF ${formatPercent(row.baseline)}`,
    status: row.status,
    tone: toneForStatus(row.status),
    basis,
    note: row.actual === null ? note : undefined,
    link,
  };
}

function targetTiles(data: TrackerData, dash: Dashboard, today: IsoDate): Tile[] {
  const s = data.settings;
  const kpi = (k: KpiRow["key"]) => dash.kpis.find((r) => r.key === k)!;
  const startText = today < s.week1Start ? ` Penilaian mulai ${formatHariTanggal(s.week1Start)}.` : "";
  const noScores = `Belum ada nilai mingguan.${startText}`;

  const total = dash.programs.find((p) => p.key === TOTAL)!;
  const iuls = kpi("iuls");
  const rust = kpi("rust");
  const passStatus: KpiStatus =
    total.pctFinalPassed === null
      ? "Belum ada data"
      : total.pctFinalPassed >= s.targetPassRate
        ? "Tercapai"
        : "Belum tercapai";

  return [
    kpiTile(kpi("coverage"), "coverage", "Cakupan coaching", { sheet: "acuan" }, "Parameter cakupan belum diisi.",
      `${s.coverageDone} dari ${s.targetCoverage} frontliner sudah coaching (Parameter)`),
    kpiTile(
      kpi("overweight"),
      "overweight",
      "BMI overweight + obesitas",
      { sheet: "bmi" },
      `Belum ada cek BMI. Cek pertama ${formatHariTanggal(s.bmiFirstCheck)}.`,
      `Cek terakhir tiap SDM yang sudah dicek; target tercapai dalam ${s.targetOverweightMonths} bulan`,
    ),
    kpiTile(kpi("knowledge"), "knowledge", "Product Knowledge", { sheet: "performa" }, noScores,
      "Rata-rata skor aspek B semua penilaian mingguan"),
    kpiTile(kpi("interactive"), "interactive", "Interactive Communicating", { sheet: "performa" }, noScores,
      "Rata-rata skor aspek D semua penilaian mingguan"),
    {
      key: "kelulusan",
      label: "Kelulusan IULS & RUST setelah remedial",
      format: "percent",
      value: total.pctFinalPassed,
      total: null,
      target: `Target ${DIRECTION_TEXT[">="]} ${formatPercent(s.targetPassRate)}`,
      baseline: total.pdfBaseline === null ? null : `Baseline PDF ${formatPercent(total.pdfBaseline)}`,
      status: passStatus,
      tone: toneForStatus(passStatus),
      basis: `${total.finalPassed} dari ${total.participants} peserta: Passed + lulus remedial`,
      detail:
        iuls.actual === null && rust.actual === null
          ? undefined
          : `IULS ${formatPercent(iuls.actual) || "–"} · RUST ${formatPercent(rust.actual) || "–"}`,
      note: total.pctFinalPassed === null ? "Belum ada hasil training di Master SDM." : undefined,
      link: { sheet: "remedial" },
    },
  ];
}

function workTiles(
  data: TrackerData,
  dash: Dashboard,
  derived: readonly StaffDerived[],
  phase: Phase,
  week: number | null,
): Tile[] {
  const s = data.settings;
  const actions = dash.actionByGroup.find((r) => r.key === TOTAL)!;
  const onDuty = derived.filter((d) => hasText(d.staff.name) && isOnDuty(d.staff.assignmentStatus));
  const assessed = week === null ? null : countAssessed(data, onDuty, week);
  const late = onDuty.filter((d) => d.bmi.scheduleStatus === "Terlambat cek").length;
  const dueSoonBmi = onDuty.filter((d) => d.bmi.scheduleStatus === "Cek ≤ 7 hari").length;
  const failed = derived.filter((d) => hasText(d.staff.name) && d.baseline.status === "Failed");
  const noRemedial = failed.filter(isFailedWithoutRemedial).length;
  const remedialPassed = failed.filter((d) => d.remedial?.status === "Lulus").length;

  return [
    {
      key: "tindak-lanjut",
      label: "Tindak lanjut selesai",
      format: "count",
      value: actions.selesai,
      total: actions.total,
      target: null,
      baseline: null,
      status: null,
      tone: actions.overdue > 0 ? "critical" : actions.total > 0 && actions.selesai === actions.total ? "good" : "neutral",
      basis: "Butir nasional berstatus Selesai",
      detail: `${actions.overdue} OVERDUE · ${actions.dueSoon} jatuh tempo ≤ 7 hari`,
      link: { sheet: "tindakLanjut" },
    },
    week !== null && assessed !== null
      ? {
          key: "dinilai",
          label: phase === "after" ? `SDM dinilai Minggu ke-${week}` : "SDM dinilai minggu ini",
          format: "count",
          value: assessed,
          total: onDuty.length,
          target: null,
          baseline: null,
          status: null,
          tone: onDuty.length > 0 && assessed === onDuty.length ? "good" : "neutral",
          basis: `SDM aktif yang sudah punya skor Minggu ke-${week}`,
          link: { sheet: "performa", query: { minggu: week } },
        }
      : {
          key: "dinilai",
          label: "SDM dinilai minggu ini",
          format: "count",
          value: null,
          total: onDuty.length,
          target: null,
          baseline: null,
          status: null,
          tone: "neutral",
          basis: `${onDuty.length} SDM aktif dinilai tiap minggu`,
          note: `Penilaian mulai Minggu ke-1, ${formatHariTanggal(s.week1Start)}.`,
          link: { sheet: "performa", query: { minggu: 1 } },
        },
    {
      key: "bmi-terlambat",
      label: "Terlambat cek BMI",
      format: "count",
      value: late,
      total: onDuty.length,
      target: null,
      baseline: null,
      status: null,
      tone: late > 0 ? "critical" : "neutral",
      basis: "SDM aktif yang lewat jadwal cek berikutnya",
      detail: `${dueSoonBmi} SDM jadwal cek ≤ 7 hari`,
      link: { sheet: "bmi" },
    },
    {
      key: "tanpa-remedial",
      label: "Failed tanpa remedial",
      format: "count",
      value: noRemedial,
      total: failed.length,
      target: null,
      baseline: null,
      status: null,
      tone: noRemedial > 0 ? "warning" : failed.length > 0 ? "good" : "neutral",
      basis: "Peserta Failed yang belum punya tindakan remedial",
      detail: failed.length > 0 ? `${remedialPassed} sudah lulus remedial` : undefined,
      link: { sheet: "remedial" },
    },
  ];
}

/** Staff in `rows` with a weekly average in `week`. */
function countAssessed(data: TrackerData, rows: readonly StaffDerived[], week: number): number {
  const scored = new Set(
    data.weeklyScores.filter((r) => r.week === week && coachingAvg(r) !== null).map((r) => r.staffCode),
  );
  return rows.filter((d) => scored.has(d.staff.code)).length;
}

// ---------------------------------------------------------------------------
// Station comparison
// ---------------------------------------------------------------------------

function comparisonRow(
  data: TrackerData,
  dash: Dashboard,
  derived: readonly StaffDerived[],
  key: string,
  week: number | null,
  bmiPeriod: number | null,
): StationComparisonRow {
  const all = key === TOTAL;
  const rows = derived.filter((d) => hasText(d.staff.name) && (all || sameText(d.staff.station, key)));
  const onDuty = rows.filter((d) => isOnDuty(d.staff.assignmentStatus));
  const unit = dash.units.find((u) => u.key === key);
  const everChecked = rows.filter((d) => d.bmi.checks > 0);
  const overweight = everChecked.filter((d) => isOverweight(d.bmi.latestCategory)).length;
  const withRekap = rows.filter((d) => d.rekap?.latest != null);
  const station = all ? null : key;
  const q = (extra: Record<string, string | number | null> = {}) => ({ stasiun: station, ...extra });

  return {
    station: key,
    staffCount: rows.length,
    assessed: { value: week === null ? null : countAssessed(data, onDuty, week), total: onDuty.length },
    score: { current: unit?.avgCurrent ?? null, baseline: unit?.avgFinal ?? null, gain: unit?.gain ?? null },
    rekap: { assessed: withRekap.length, lulus: withRekap.filter((d) => d.rekap?.currentStatus === "Lulus").length },
    bmi: {
      checkedThisPeriod:
        bmiPeriod === null ? null : onDuty.filter((d) => (d.bmi.periods[bmiPeriod - 1]?.bmi ?? null) !== null).length,
      everChecked: everChecked.length,
      overweight,
      pctOverweight: everChecked.length === 0 ? null : overweight / everChecked.length,
      late: onDuty.filter((d) => d.bmi.scheduleStatus === "Terlambat cek").length,
    },
    training: {
      passed: rows.filter((d) => d.baseline.status === "Passed").length,
      failed: rows.filter((d) => d.baseline.status === "Failed").length,
      remedialPassed: rows.filter((d) => d.remedial?.status === "Lulus").length,
      failedNoRemedial: rows.filter(isFailedWithoutRemedial).length,
      beda: rows.filter((d) => startsWithText(d.baseline.consistency, "Beda")).length,
    },
    replacements: unit?.replacements ?? 0,
    links: {
      station: { sheet: "dashboard", query: q() },
      performa: { sheet: "performa", query: q({ minggu: week ?? 1 }) },
      rekap: { sheet: "performa", query: q({ tab: "rekap" }) },
      bmi: { sheet: "bmi", query: q(bmiPeriod ? { periode: bmiPeriod } : {}) },
      sdm: { sheet: "sdm", query: q() },
      remedial: { sheet: "remedial", query: q() },
      penggantian: { sheet: "penggantian", query: q() },
    },
  };
}

export const COMPARISON_SORTS = [
  { key: "stasiun", label: "Urutan stasiun" },
  { key: "dinilai", label: "Paling sedikit dinilai" },
  { key: "skor", label: "Skor terendah" },
  { key: "bmi", label: "Overweight terbanyak" },
  { key: "terlambat", label: "Terlambat cek BMI" },
  { key: "remedial", label: "Failed tanpa remedial" },
] as const;

export type ComparisonSort = (typeof COMPARISON_SORTS)[number]["key"];

export function parseSort(raw: string | string[] | undefined): ComparisonSort {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return COMPARISON_SORTS.find((s) => s.key === v)?.key ?? "stasiun";
}

/** Most urgent station first for the chosen column; ties keep the station order. Empty values go last. */
export function sortComparison(rows: readonly StationComparisonRow[], sort: ComparisonSort): StationComparisonRow[] {
  if (sort === "stasiun") return [...rows];
  const metric = (r: StationComparisonRow): number | null => {
    switch (sort) {
      case "dinilai":
        return r.assessed.value === null || r.assessed.total === 0 ? null : r.assessed.value / r.assessed.total;
      case "skor":
        return r.score.current;
      case "bmi":
        return r.bmi.pctOverweight === null ? null : -r.bmi.pctOverweight;
      case "terlambat":
        return -r.bmi.late;
      case "remedial":
        return -r.training.failedNoRemedial;
    }
  };
  return rows
    .map((r, i) => ({ r, i, m: metric(r) }))
    .sort((a, b) => {
      if (a.m === null && b.m === null) return a.i - b.i;
      if (a.m === null) return 1;
      if (b.m === null) return -1;
      return a.m - b.m || a.i - b.i;
    })
    .map(({ r }) => r);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * KPI tiles and per-station comparison for `stations` (the stations in view: all for KPS /
 * the owner, one for a station link). `data` must already be limited to that scope
 * (lib/workspace trackerData).
 */
export function dashboardSummary(data: TrackerData, today: IsoDate, stations: readonly string[]): DashboardSummary {
  const s = data.settings;
  const phase = phaseOf(s, today);
  const week = weekOfDate(today, s) ?? (phase === "after" ? s.weeks : null);
  const bmiPeriod = currentBmiPeriod(s, today);
  const dash = dashboard(data, today);
  const derived = staffDerived(data, today);

  return {
    asOf: today,
    phase,
    week,
    bmiPeriod,
    dash,
    derived,
    targets: targetTiles(data, dash, today),
    work: workTiles(data, dash, derived, phase, week),
    comparison: stations.map((code) => comparisonRow(data, dash, derived, code, week, bmiPeriod)),
    comparisonTotal: stations.length > 1 ? comparisonRow(data, dash, derived, TOTAL, week, bmiPeriod) : null,
  };
}

/** "Cek BMI periode 2 (26 Okt 2026)". */
export function bmiPeriodLabel(s: Settings, period: number): string {
  return `Cek BMI periode ${period} (${formatTanggal(bmiCheckDate(period, s))})`;
}

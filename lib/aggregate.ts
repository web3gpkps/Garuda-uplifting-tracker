/**
 * Dashboard (sections 1–6) and Laporan Mingguan (sections A–D) of the Garuda workbook.
 *
 * Input: plain arrays of DB rows with **camelCase** keys, typed in `./rules`.
 * Map supabase-js results with `camelize()` from `./rules`. "Today" is always an argument.
 *
 * Output conventions:
 * - A section is an array of rows (per program, action group, aspect or station) followed by a
 *   `TOTAL` row (trend: `SEMUA`).
 * - Excel `""` (nothing to show) is `null`.
 * - Ratios (`pct*`, KPI values) are fractions 0..1. `avgProgress` is 0..100 (DB units).
 * - Averages are not rounded; format at display.
 */

import {
  ACTION_GROUPS,
  ASPECTS,
  COACHING_ASPECTS,
  PROGRAMS,
  actionFlag,
  average,
  bmiCheckDate,
  bmiPeriodForWeek,
  bmiSummary,
  cleanFloat,
  coachingAvg,
  coachingStatus,
  isOverweight,
  remedialResult,
  replacementPass,
  replacementTimeliness,
  sameText,
  staffBaseline,
  staffRekap,
  startsWithText,
  weekEnd,
  weekStart,
  type ActionItemRow,
  type BmiCheckRow,
  type BmiSummary,
  type CoachingAspectKey,
  type DateInput,
  type IsoDate,
  type RemedialRow,
  type RemedialStatus,
  type ReplacementRow,
  type Settings,
  type StaffBaseline,
  type StaffRekap,
  type StaffRow,
  type StationRow,
  type WeeklyScoreRow,
} from './rules';
import { toIsoDate } from './dates';
import { BASELINE_BMI_GAP, BASELINE_COACHING, baselinePassRate } from './baseline';

export const TOTAL = 'TOTAL';
export const SEMUA = 'SEMUA';

export interface TrackerData {
  settings: Settings;
  staff: readonly StaffRow[];
  weeklyScores: readonly WeeklyScoreRow[];
  bmiChecks: readonly BmiCheckRow[];
  actionItems: readonly ActionItemRow[];
  remedials: readonly RemedialRow[];
  replacements: readonly ReplacementRow[];
  /** Station order; defaults to the stations that appear in `staff`, alphabetically. */
  stations?: readonly StationRow[];
}

// ---------------------------------------------------------------------------
// Output rows
// ---------------------------------------------------------------------------

export type KpiStatus = 'Tercapai' | 'Belum tercapai' | 'Di atas posisi awal' | 'Di bawah posisi awal' | 'Belum ada data';

/** Dashboard 1: one programme KPI. Values are fractions 0..1. */
export interface KpiRow {
  key: 'coverage' | 'overweight' | 'knowledge' | 'interactive' | 'passRate' | 'iuls' | 'rust';
  label: string;
  baseline: number | null;
  target: number | null;
  /** `>=`, `>`, `<` against target; `baseline` = compare with the baseline (no explicit target). */
  direction: '>=' | '>' | '<' | 'baseline';
  actual: number | null;
  status: KpiStatus;
  basis: string;
}

/** Dashboard 2–3 / Laporan B (per action group or aspect). */
export interface ActionProgressRow {
  key: string;
  total: number;
  selesai: number;
  onProgress: number;
  belumMulai: number;
  tertunda: number;
  overdue: number;
  /** Flag "Jatuh tempo ≤ 7 hari". */
  dueSoon: number;
  /** Selesai / total, 0..1. */
  pctDone: number | null;
  /** Mean progress, 0..100. */
  avgProgress: number | null;
}

/** Dashboard 4 (per program). */
export interface ProgramResultRow {
  key: string;
  participants: number;
  passed: number;
  failed: number;
  /** Failure cause "Kendala operasional & kehadiran". */
  absentRolePlay: number;
  remedialRecorded: number;
  remedialPassed: number;
  /** Passed + remedial passed. */
  finalPassed: number;
  pctFinalPassed: number | null;
  /** Gapura pass rate at the posisi awal (evaluasi Agu 2026), lib/baseline. */
  pdfBaseline: number | null;
  /** Remark in the report differs from the criteria. */
  beda: number;
}

/** Dashboard 5 (per station). */
export interface UnitRow {
  key: string;
  staffCount: number;
  passed: number;
  failed: number;
  avgFinal: number | null;
  avgCurrent: number | null;
  gain: number | null;
  improved: number;
  currentLulus: number;
  bmiChecked: number;
  overweight: number;
  avgWeightDelta: number | null;
  remedialPassed: number;
  replacements: number;
}

/** Dashboard 6. */
export interface ReplacementOverview {
  toReplace: number;
  placed: number;
  passed: number;
  lateOrOverdue: number;
  reported: number;
}

/** Laporan A (per program, selected week). */
export interface WeeklyPerformanceRow {
  key: string;
  staffCount: number;
  assessed: number;
  avgThisWeek: number | null;
  avgLastWeek: number | null;
  changeVsLastWeek: number | null;
  baselineAvg: number | null;
  gainVsBaseline: number | null;
  lulus: number;
  belumLulus: number;
  pctLulus: number | null;
}

/** Laporan A2 (per program, selected week): mean per coaching aspect. */
export interface AspectAverageRow {
  key: string;
  averages: Record<CoachingAspectKey, number | null>;
  knowledgeMet: boolean | null;
  communicationMet: boolean | null;
}

/** Laporan C (per program, BMI slot of the selected week). */
export interface BmiSlotRow {
  key: string;
  staffCount: number;
  checked: number;
  notChecked: number;
  normal: number;
  kurus: number;
  overweight: number;
  obesitas: number;
  /** (overweight + obesitas) / checked, 0..1. */
  pctOverweight: number | null;
  /** From each staff member's schedule, not the selected slot. */
  lateChecks: number;
}

/** Laporan D. `weeks[0]` is week 1. */
export interface TrendRow {
  key: string;
  weeks: Array<number | null>;
}

export interface Dashboard {
  asOf: IsoDate;
  kpis: KpiRow[];
  actionByGroup: ActionProgressRow[];
  actionByAspect: ActionProgressRow[];
  programs: ProgramResultRow[];
  units: UnitRow[];
  replacements: ReplacementOverview;
}

export interface WeeklyReport {
  week: number;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  bmiPeriod: number;
  bmiPlannedDate: IsoDate;
  asOf: IsoDate;
  performance: WeeklyPerformanceRow[];
  aspects: AspectAverageRow[];
  actionProgress: ActionProgressRow[];
  bmi: BmiSlotRow[];
  trend: TrendRow[];
}

export interface StaffDerived {
  staff: StaffRow;
  baseline: StaffBaseline;
  rekap: StaffRekap | null;
  bmi: BmiSummary;
  remedial: { row: RemedialRow; finalResult: number | null; status: RemedialStatus } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasText(v: string | null | undefined): boolean {
  return v != null && v.trim() !== '';
}

function count<T>(rows: readonly T[], pred: (r: T) => boolean): number {
  let n = 0;
  for (const r of rows) if (pred(r)) n += 1;
  return n;
}

function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

function diff(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : cleanFloat(a - b);
}

function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

export function stationCodes(stations: readonly StationRow[] | undefined, staff: readonly StaffRow[] = []): string[] {
  if (stations && stations.length > 0) {
    return [...stations]
      .map((s, i) => ({ s, i }))
      .sort((a, b) => (a.s.sort ?? a.i) - (b.s.sort ?? b.i) || a.i - b.i)
      .map(({ s }) => s.code);
  }
  return [...new Set(staff.map((s) => s.station).filter((s): s is string => hasText(s)))].sort();
}

function inProgram(program: string | null | undefined, key: string): boolean {
  return key === TOTAL || key === SEMUA || sameText(program, key);
}

/** Per-staff derived values (Master SDM, Rekap Performa, Cek BMI, Remedial), in input order. */
export function staffDerived(data: TrackerData, today: DateInput): StaffDerived[] {
  const s = data.settings;
  const scoresByStaff = groupBy(data.weeklyScores, (r) => r.staffCode);
  const checksByStaff = groupBy(data.bmiChecks, (r) => r.staffCode);
  const remedialByStaff = new Map(data.remedials.map((r) => [r.staffCode, r] as const));
  return data.staff.map((st) => {
    const rem = remedialByStaff.get(st.code) ?? null;
    return {
      staff: st,
      baseline: staffBaseline(st, s),
      rekap: hasText(st.name) ? staffRekap(st, scoresByStaff.get(st.code) ?? [], s) : null,
      bmi: bmiSummary(checksByStaff.get(st.code) ?? [], st.bmiHasNote, s, today),
      remedial: rem ? { row: rem, ...remedialResult(rem, s) } : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Action items (Dashboard 2–3, Laporan B)
// ---------------------------------------------------------------------------

export function actionProgress(
  items: readonly ActionItemRow[],
  today: DateInput,
  keys: readonly string[],
  keyOf: (item: ActionItemRow) => string | null | undefined,
): ActionProgressRow[] {
  const flagged = items.filter((it) => hasText(it.code)).map((it) => ({ it, flag: actionFlag(it, today) }));
  const row = (key: string): ActionProgressRow => {
    const rows = key === TOTAL ? flagged : flagged.filter(({ it }) => sameText(keyOf(it), key));
    const selesai = count(rows, ({ it }) => sameText(it.status, 'Selesai'));
    return {
      key,
      total: rows.length,
      selesai,
      onProgress: count(rows, ({ it }) => sameText(it.status, 'On Progress')),
      belumMulai: count(rows, ({ it }) => sameText(it.status, 'Belum Mulai')),
      tertunda: count(rows, ({ it }) => sameText(it.status, 'Tertunda')),
      overdue: count(rows, ({ flag }) => flag === 'OVERDUE'),
      dueSoon: count(rows, ({ flag }) => startsWithText(flag, 'Jatuh tempo')),
      pctDone: ratio(selesai, rows.length),
      avgProgress: average(rows.map(({ it }) => it.progress)),
    };
  };
  return [...keys.map(row), row(TOTAL)];
}

export function actionByGroup(items: readonly ActionItemRow[], today: DateInput): ActionProgressRow[] {
  return actionProgress(items, today, ACTION_GROUPS, (it) => it.groupName);
}

export function actionByAspect(items: readonly ActionItemRow[], today: DateInput): ActionProgressRow[] {
  return actionProgress(items, today, ASPECTS, (it) => it.aspect);
}

// ---------------------------------------------------------------------------
// Dashboard 4: results per program
// ---------------------------------------------------------------------------

export function programResults(derived: readonly StaffDerived[]): ProgramResultRow[] {
  const row = (key: string): ProgramResultRow => {
    const rows = derived.filter((d) => hasText(d.staff.name) && inProgram(d.staff.program, key));
    const passed = count(rows, (d) => d.baseline.status === 'Passed');
    const failed = count(rows, (d) => d.baseline.status === 'Failed');
    const participants = passed + failed;
    const remedialPassed = count(rows, (d) => d.remedial?.status === 'Lulus');
    const finalPassed = passed + remedialPassed;
    return {
      key,
      participants,
      passed,
      failed,
      absentRolePlay: count(rows, (d) => startsWithText(d.baseline.failureCause, 'Kendala')),
      remedialRecorded: count(rows, (d) => hasText(d.remedial?.row.action)),
      remedialPassed,
      finalPassed,
      pctFinalPassed: ratio(finalPassed, participants),
      pdfBaseline: baselinePassRate(key),
      beda: count(rows, (d) => startsWithText(d.baseline.consistency, 'Beda')),
    };
  };
  return [...PROGRAMS.map(row), row(TOTAL)];
}

// ---------------------------------------------------------------------------
// Dashboard 5: per station
// ---------------------------------------------------------------------------

export function unitOverview(data: TrackerData, derived: readonly StaffDerived[]): UnitRow[] {
  const row = (key: string): UnitRow => {
    const rows = derived.filter((d) => hasText(d.staff.name) && (key === TOTAL || sameText(d.staff.station, key)));
    const avgFinal = average(rows.map((d) => d.baseline.finalResult));
    const avgCurrent = average(rows.map((d) => d.rekap?.latest ?? null));
    return {
      key,
      staffCount: rows.length,
      passed: count(rows, (d) => d.baseline.status === 'Passed'),
      failed: count(rows, (d) => d.baseline.status === 'Failed'),
      avgFinal,
      avgCurrent,
      gain: diff(avgCurrent, avgFinal),
      improved: count(rows, (d) => startsWithText(d.rekap?.trend, '▲')),
      currentLulus: count(rows, (d) => d.rekap?.currentStatus === 'Lulus'),
      bmiChecked: count(rows, (d) => d.bmi.checks > 0),
      overweight: count(rows, (d) => isOverweight(d.bmi.latestCategory)),
      avgWeightDelta: average(rows.map((d) => d.bmi.weightDelta)),
      remedialPassed: count(rows, (d) => d.remedial?.status === 'Lulus'),
      replacements: count(
        data.replacements,
        (r) => hasText(r.replacedName) && (key === TOTAL || sameText(r.station, key)),
      ),
    };
  };
  return [...stationCodes(data.stations, data.staff).map(row), row(TOTAL)];
}

// ---------------------------------------------------------------------------
// Dashboard 6: replacements
// ---------------------------------------------------------------------------

export function replacementOverview(
  replacements: readonly ReplacementRow[],
  s: Settings,
  today: DateInput,
): ReplacementOverview {
  return {
    toReplace: count(replacements, (r) => hasText(r.replacedName)),
    placed: count(replacements, (r) => hasText(r.replacementName)),
    passed: count(replacements, (r) => replacementPass(r, s) === 'Lulus'),
    lateOrOverdue: count(replacements, (r) => {
      const t = replacementTimeliness(r, s, today);
      return t === 'OVERDUE' || startsWithText(t, 'Lewat');
    }),
    reported: count(replacements, (r) => sameText(r.reported, 'Ya')),
  };
}

// ---------------------------------------------------------------------------
// Dashboard 1: KPI
// ---------------------------------------------------------------------------

function kpiStatus(
  actual: number | null,
  target: number | null,
  baseline: number | null,
  direction: KpiRow['direction'],
): KpiStatus {
  if (actual === null) return 'Belum ada data';
  if (direction === 'baseline') {
    if (baseline === null) return 'Belum ada data';
    return actual >= baseline ? 'Di atas posisi awal' : 'Di bawah posisi awal';
  }
  if (target === null) return 'Belum ada data';
  const ok = direction === '>=' ? actual >= target : direction === '>' ? actual > target : actual < target;
  return ok ? 'Tercapai' : 'Belum tercapai';
}

function aspectAverage(scores: readonly WeeklyScoreRow[], key: CoachingAspectKey): number | null {
  return average(scores.map((r) => r[key]));
}

export function kpis(data: TrackerData, derived: readonly StaffDerived[]): KpiRow[] {
  const s = data.settings;
  const checked = derived.filter((d) => hasText(d.staff.name) && d.bmi.checks > 0);
  const overweight = ratio(count(checked, (d) => isOverweight(d.bmi.latestCategory)), checked.length);
  const knowledge = aspectAverage(data.weeklyScores, 'scoreKnowledge');
  const communication = aspectAverage(data.weeklyScores, 'scoreCommunication');
  const logAverages = data.weeklyScores.map((r) => coachingAvg(r)).filter((v): v is number => v !== null);
  const passRate = ratio(count(logAverages, (v) => coachingStatus(v, s) === 'Lulus'), logAverages.length);
  const programs = programResults(derived);
  const prog = (k: 'IULS' | 'RUST') => programs.find((p) => p.key === k)!;
  const gapBmi = BASELINE_BMI_GAP;

  const make = (
    key: KpiRow['key'],
    label: string,
    baseline: number | null,
    target: number | null,
    direction: KpiRow['direction'],
    actual: number | null,
    basis: string,
  ): KpiRow => ({
    key,
    label,
    baseline,
    target,
    direction,
    actual,
    status: kpiStatus(actual, target, baseline, direction),
    basis,
  });

  return [
    make('coverage', 'Cakupan coaching frontliner', BASELINE_COACHING.coverage, 1, '>=',
      ratio(s.coverageDone, s.targetCoverage),
      `Frontliner sudah coaching (Parameter) ÷ ${s.targetCoverage}`),
    make('overweight', 'Proporsi BMI overweight + obesitas', gapBmi, s.targetOverweightMax, '<', overweight,
      'Kategori cek terakhir tiap SDM yang sudah dicek; posisi awal = gap BMI evaluasi Agu 2026'),
    make('knowledge', 'Ketepatan jawaban Product Knowledge', null, s.targetKnowledge, '>',
      knowledge === null ? null : knowledge / 100, 'Rata-rata skor aspek B ÷ 100'),
    make('interactive', 'Skor Interactive Communicating', null, s.targetInteractive, '>',
      communication === null ? null : communication / 100, 'Rata-rata skor aspek D ÷ 100'),
    make('passRate', 'Pass rate coaching (skor ≥ passing grade)', BASELINE_COACHING.passRate, null, 'baseline', passRate,
      'Penilaian Lulus ÷ seluruh penilaian mingguan, dibanding posisi awal nasional'),
    make('iuls', 'Kelulusan IULS peserta Gapura (termasuk remedial)', baselinePassRate('IULS'), s.targetPassRate, '>=',
      prog('IULS').pctFinalPassed, 'Passed + lulus remedial ÷ peserta IULS'),
    make('rust', 'Kelulusan RUST peserta Gapura (termasuk remedial)', baselinePassRate('RUST'), s.targetPassRate, '>=',
      prog('RUST').pctFinalPassed, 'Passed + lulus remedial ÷ peserta RUST'),
  ];
}

export function dashboard(data: TrackerData, today: DateInput): Dashboard {
  const derived = staffDerived(data, today);
  return {
    asOf: toIsoDate(today),
    kpis: kpis(data, derived),
    actionByGroup: actionByGroup(data.actionItems, today),
    actionByAspect: actionByAspect(data.actionItems, today),
    programs: programResults(derived),
    units: unitOverview(data, derived),
    replacements: replacementOverview(data.replacements, data.settings, today),
  };
}

// ---------------------------------------------------------------------------
// Laporan Mingguan
// ---------------------------------------------------------------------------

interface LogRow {
  row: WeeklyScoreRow;
  week: number;
  program: string | null;
  avg: number | null;
}

/** Log Performa rows with their average (L) and the staff member's program (F). */
function logRows(data: TrackerData): LogRow[] {
  const programOf = new Map(data.staff.map((st) => [st.code, st.program] as const));
  return data.weeklyScores.map((r) => ({
    row: r,
    week: r.week,
    program: programOf.get(r.staffCode) ?? null,
    avg: coachingAvg(r),
  }));
}

const PROGRAM_KEYS: readonly string[] = [...PROGRAMS, TOTAL];

/** Laporan A for `week`. */
export function weeklyPerformance(
  data: TrackerData,
  week: number,
  derived: readonly StaffDerived[],
  logs = logRows(data),
): WeeklyPerformanceRow[] {
  const s = data.settings;
  return PROGRAM_KEYS.map((key) => {
    const forKey = logs.filter((l) => inProgram(l.program, key));
    const thisWeek = forKey.filter((l) => l.week === week && l.avg !== null);
    const avgThisWeek = average(thisWeek.map((l) => l.avg));
    const avgLastWeek = week === 1 ? null : average(forKey.filter((l) => l.week === week - 1).map((l) => l.avg));
    const staffRows = derived.filter((d) => hasText(d.staff.name) && inProgram(d.staff.program, key));
    const baselineAvg = average(staffRows.map((d) => d.baseline.finalResult));
    const lulus = count(thisWeek, (l) => coachingStatus(l.avg, s) === 'Lulus');
    return {
      key,
      staffCount: staffRows.length,
      assessed: thisWeek.length,
      avgThisWeek,
      avgLastWeek,
      changeVsLastWeek: diff(avgThisWeek, avgLastWeek),
      baselineAvg,
      gainVsBaseline: diff(avgThisWeek, baselineAvg),
      lulus,
      belumLulus: count(thisWeek, (l) => coachingStatus(l.avg, s) === 'Belum Lulus'),
      pctLulus: ratio(lulus, thisWeek.length),
    };
  });
}

/** Laporan A2 for `week`. */
export function aspectAverages(data: TrackerData, week: number, logs = logRows(data)): AspectAverageRow[] {
  const s = data.settings;
  return PROGRAM_KEYS.map((key) => {
    const rows = logs.filter((l) => l.week === week && inProgram(l.program, key)).map((l) => l.row);
    const averages = Object.fromEntries(COACHING_ASPECTS.map((a) => [a.key, aspectAverage(rows, a.key)])) as Record<
      CoachingAspectKey,
      number | null
    >;
    return {
      key,
      averages,
      knowledgeMet: averages.scoreKnowledge === null ? null : averages.scoreKnowledge > s.targetKnowledge * 100,
      communicationMet:
        averages.scoreCommunication === null ? null : averages.scoreCommunication > s.targetInteractive * 100,
    };
  });
}

/** Laporan C for BMI slot `period`. */
export function bmiSlotByProgram(derived: readonly StaffDerived[], period: number): BmiSlotRow[] {
  return PROGRAM_KEYS.map((key) => {
    const rows = derived.filter((d) => hasText(d.staff.name) && inProgram(d.staff.program, key));
    const inSlot = rows.map((d) => d.bmi.periods[period - 1] ?? null);
    const checked = count(inSlot, (p) => (p?.bmi ?? 0) > 0);
    const overweight = count(inSlot, (p) => p?.category === 'Overweight');
    const obesitas = count(inSlot, (p) => p?.category === 'Obesitas');
    return {
      key,
      staffCount: rows.length,
      checked,
      notChecked: rows.length - checked,
      normal: count(inSlot, (p) => p?.category === 'Normal'),
      kurus: count(inSlot, (p) => p?.category === 'Kurus'),
      overweight,
      obesitas,
      pctOverweight: ratio(overweight + obesitas, checked),
      lateChecks: count(rows, (d) => d.bmi.scheduleStatus === 'Terlambat cek'),
    };
  });
}

/** Laporan D: mean weekly score per program and for everyone, weeks 1 … settings.weeks. */
export function weeklyTrend(data: TrackerData, logs = logRows(data)): TrendRow[] {
  const weeks = Array.from({ length: data.settings.weeks }, (_, i) => i + 1);
  return [...PROGRAMS, SEMUA].map((key) => {
    const forKey = logs.filter((l) => inProgram(l.program, key));
    return { key, weeks: weeks.map((w) => average(forKey.filter((l) => l.week === w).map((l) => l.avg))) };
  });
}

export function weeklyReport(data: TrackerData, week: number, today: DateInput): WeeklyReport {
  const s = data.settings;
  if (!Number.isInteger(week) || week < 1) throw new Error(`Invalid week: ${week}`);
  const derived = staffDerived(data, today);
  const logs = logRows(data);
  const bmiPeriod = bmiPeriodForWeek(week, s);
  return {
    week,
    periodStart: weekStart(week, s),
    periodEnd: weekEnd(week, s),
    bmiPeriod,
    bmiPlannedDate: bmiCheckDate(bmiPeriod, s),
    asOf: toIsoDate(today),
    performance: weeklyPerformance(data, week, derived, logs),
    aspects: aspectAverages(data, week, logs),
    actionProgress: actionByGroup(data.actionItems, today),
    bmi: bmiSlotByProgram(derived, bmiPeriod),
    trend: weeklyTrend(data, logs),
  };
}

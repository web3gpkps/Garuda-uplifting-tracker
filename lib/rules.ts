/**
 * Business rules ported from "Tracker Tindak Lanjut People Development Garuda.xlsx".
 *
 * Pure and framework-free. Conventions:
 * - Rows are DB rows with camelCase keys (`role_play` → `rolePlay`); use `camelize()` on what
 *   supabase-js returns. Text columns are plain strings; values outside the expected
 *   vocabulary simply never match (as in the workbook).
 * - Dates are ISO `YYYY-MM-DD` strings. "Today" is always passed in (`IsoDate` or `Date`,
 *   a `Date` is read as its calendar date in Asia/Jakarta). Nothing here calls `new Date()`.
 * - Excel's empty string `""` is `null` here.
 * - Thresholds always come from `Settings` (sheet Parameter). Labels are the workbook's own.
 *
 * Excel semantics kept on purpose:
 * - ROUND is half away from zero on the 15-significant-digit value (`excelRound`).
 * - AVERAGE ignores blanks; statuses compare the *rounded* value.
 * - `=` and COUNTIF criteria on text are case-insensitive.
 */

import { addDays, addMonths, diffDays, formatTanggalPendek, toIsoDate, type IsoDate } from './dates';

export type { IsoDate } from './dates';
export type DateInput = IsoDate | Date;

// ---------------------------------------------------------------------------
// Vocabulary (sheet Parameter lists)
// ---------------------------------------------------------------------------

export const PROGRAMS = ['IULS', 'RUST'] as const;
export type Program = (typeof PROGRAMS)[number];

export const TOUCH_POINTS = [
  'Check-in Counter',
  'Customer Service',
  'Boarding Gate',
  'Transfer Desk',
  'Baggage Service',
] as const;
export type TouchPoint = (typeof TOUCH_POINTS)[number];

export const ASSIGNMENT_STATUSES = ['Aktif', 'Remedial', 'Individual Coaching', 'Ditarik dari layanan'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ACTION_GROUPS = ['Coaching Frontliner', 'Timeline Training', 'Evaluasi IULS & RUST'] as const;
export type ActionGroup = (typeof ACTION_GROUPS)[number];

export const ASPECTS = [
  'Fit & Grooming (BMI)',
  'Product Knowledge',
  'Komunikasi & Interactive Skill',
  'Grooming & Aksesori',
  'Coaching Coverage',
  'Remedial',
] as const;
export type Aspect = (typeof ASPECTS)[number];

export const REMEDIAL_ACTIONS = [
  'Refresher & Remedial Assessment',
  'Individual Coaching',
  'Refresher + Individual Coaching',
] as const;
export type RemedialAction = (typeof REMEDIAL_ACTIONS)[number];

/** Service-gap topics (PDF slide 12) plus the two the workbook adds. */
export const GAP_TOPICS = [
  'BMI',
  'GA Miles',
  'Refund/Rebook',
  'Piece Concept',
  'Penanganan Irregularity',
  'Aksesoris',
  'Kuku',
  'Seragam',
  'Senyum',
  'Salam',
  'Bahasa',
  'Kelas & Lounge',
  'Lainnya',
] as const;

/** The four coaching assessment aspects (PDF slide 2), in Log Performa column order H–K. */
export const COACHING_ASPECTS = [
  { key: 'scoreGrooming', letter: 'A', label: 'Grooming & Appearance' },
  { key: 'scoreKnowledge', letter: 'B', label: 'Product Knowledge' },
  { key: 'scoreAttitude', letter: 'C', label: 'Attitude & Behaviour' },
  { key: 'scoreCommunication', letter: 'D', label: 'Communication Skill' },
] as const;
export type CoachingAspectKey = (typeof COACHING_ASPECTS)[number]['key'];

export type Gender = 'L' | 'P';
export type Remark = 'Passed' | 'Failed';
export type Consistency = 'Sama' | 'Beda – verifikasi';
export type FailureCause =
  | 'Kendala operasional & kehadiran (absen role play)'
  | 'Role play & post-test belum optimal'
  | 'Performa role play belum optimal';
export type CoachingStatus = 'Lulus' | 'Belum Lulus';
export type Trend = '▲ Naik' | '▼ Turun' | '= Tetap';
export type BmiCategory = 'Kurus' | 'Normal' | 'Overweight' | 'Obesitas';
export type BmiScheduleStatus = 'Terlambat cek' | 'Cek ≤ 7 hari' | 'Terjadwal';
export type ActionStatus = 'Belum Mulai' | 'On Progress' | 'Selesai' | 'Tertunda';
export type ActionKind = 'Sekali' | 'Rutin';
export type ActionFlag =
  | 'Selesai'
  | 'OVERDUE'
  | 'Jatuh tempo ≤ 7 hari'
  | 'Rutin – pantau'
  | 'On Track'
  | 'Batas waktu belum ditetapkan';
export type RemedialStatus = 'Lulus' | 'Belum Lulus' | 'Menunggu hasil' | 'Belum dijadwalkan';
export type ReplacementPass = 'Lulus' | 'Belum Lulus' | 'Belum training/dinilai';
/** `Lewat …` carries the deadline, e.g. `Lewat 14 Des`. */
export type ReplacementTimeliness = 'Tepat waktu' | 'Menunggu' | 'OVERDUE' | `Lewat ${string}`;
export type Reported = 'Ya' | 'Belum';

// ---------------------------------------------------------------------------
// Settings (sheet Parameter)
// ---------------------------------------------------------------------------

export interface Settings {
  week1Start: IsoDate;
  weeks: number;
  bmiFirstCheck: IsoDate;
  /** Every staff member is checked every n days (default 14: once per two weeks). */
  bmiIntervalDays: number;
  /** Number of BMI check slots (periods); the sheet tab follows it (lib/sync/bmi-structure.ts). */
  bmiPeriods: number;
  bmiUnderweightBelow: number;
  bmiNormalMax: number;
  bmiOverweightMax: number;
  passGrade: number;
  weightRolePlay: number;
  weightPostTest: number;
  /** KPI targets as fractions 0..1 (slide 15). */
  targetOverweightMax: number;
  targetOverweightMonths: number;
  targetKnowledge: number;
  targetInteractive: number;
  targetCoverage: number;
  coverageDone: number;
  targetPassRate: number;
  replacementDeadline: IsoDate;
}

/** Values of sheet Parameter. */
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  week1Start: '2026-10-05',
  weeks: 10,
  bmiFirstCheck: '2026-10-12',
  bmiIntervalDays: 14,
  bmiPeriods: 6,
  bmiUnderweightBelow: 18.5,
  bmiNormalMax: 25,
  bmiOverweightMax: 27,
  passGrade: 85,
  weightRolePlay: 0.4,
  weightPostTest: 0.6,
  targetOverweightMax: 0.2,
  targetOverweightMonths: 6,
  targetKnowledge: 0.9,
  targetInteractive: 0.92,
  targetCoverage: 812,
  coverageDone: 795,
  targetPassRate: 1,
  replacementDeadline: '2026-12-14',
});

// ---------------------------------------------------------------------------
// Row shapes (camelCase DB rows; only the fields the rules read are required)
// ---------------------------------------------------------------------------

export interface StaffRow {
  code: string;
  program: string | null;
  provider?: string | null;
  station: string | null;
  name: string | null;
  employeeNo?: string | null;
  gender: string | null;
  touchPoint?: string | null;
  rolePlay: number | null;
  postTest: number | null;
  reportRemark: string | null;
  assignmentStatus?: string | null;
  feedback?: string | null;
  notes?: string | null;
  bmiHasNote?: boolean | null;
  bmiNote?: string | null;
  sortOrder?: number | null;
}

export interface CoachingScores {
  scoreGrooming: number | null;
  scoreKnowledge: number | null;
  scoreAttitude: number | null;
  scoreCommunication: number | null;
}

export interface WeeklyScoreRow extends CoachingScores {
  staffCode: string;
  week: number;
  touchPoint?: string | null;
  gapTopic?: string | null;
  observer?: string | null;
  coachingNotes?: string | null;
}

export interface BmiCheckRow {
  staffCode: string;
  period: number;
  checkDate?: IsoDate | null;
  heightCm: number | null;
  weightKg: number | null;
}

export interface ActionItemRow {
  code: string;
  groupName: string | null;
  aspect?: string | null;
  rootCause?: string | null;
  action?: string | null;
  target?: string | null;
  kind: string | null;
  schedule?: string | null;
  dueDate: IsoDate | null;
  pic?: string | null;
  status: string | null;
  progress: number | null;
  updatedOn?: IsoDate | null;
  evidence?: string | null;
  kpsNotes?: string | null;
  source?: string | null;
  sortOrder?: number | null;
}

export interface RemedialRow {
  id?: number;
  staffCode: string;
  action: string | null;
  remedialOn?: IsoDate | null;
  rolePlay: number | null;
  postTest: number | null;
  reported?: string | null;
  notes?: string | null;
  sortOrder?: number | null;
}

export interface ReplacementRow {
  id?: number;
  program?: string | null;
  station?: string | null;
  /** Link to the staff row when the replaced person is in the roster; `replacedName` keeps the sheet text. */
  staffCode?: string | null;
  replacedName: string | null;
  reason?: string | null;
  withdrawnOn?: IsoDate | null;
  replacementName: string | null;
  effectiveOn: IsoDate | null;
  trainingOn?: IsoDate | null;
  postTest: number | null;
  finalResult: number | null;
  reported: string | null;
  notes?: string | null;
  sortOrder?: number | null;
}

export interface StationRow {
  code: string;
  sort?: number | null;
}

// ---------------------------------------------------------------------------
// snake_case → camelCase
// ---------------------------------------------------------------------------

type SnakeToCamel<S extends string> = S extends `${infer H}_${infer T}`
  ? `${H}${Capitalize<SnakeToCamel<T>>}`
  : S;
export type Camelize<T> = { [K in keyof T as K extends string ? SnakeToCamel<K> : K]: T[K] };

/** `{ role_play: 80, week1_start: '…' }` → `{ rolePlay: 80, week1Start: '…' }` (shallow). */
export function camelize<T extends object>(row: T): Camelize<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out as Camelize<T>;
}

// ---------------------------------------------------------------------------
// Excel primitives
// ---------------------------------------------------------------------------

/**
 * Excel ROUND: half away from zero, applied to the value as Excel sees it
 * (15 significant digits), so binary noise does not decide the tie.
 * `excelRound(3.335, 2) === 3.34`, `excelRound(-2.5) === -3`, `excelRound(18.45, 1) === 18.5`.
 */
export function excelRound(value: number, digits = 0): number {
  if (value === 0) return 0;
  if (!Number.isFinite(value) || Math.abs(value) >= 1e15) return value;
  const sign = value < 0 ? -1 : 1;
  const [mantissa, exp] = Math.abs(value).toExponential(14).split('e');
  const shifted = Number(`${mantissa}e${Number(exp) + digits}`);
  const result = sign * Number(`${Math.round(shifted)}e${-digits}`);
  return result === 0 ? 0 : result;
}

/** Removes binary noise from a difference of decimal inputs (89.5 − 55.2 → 34.3, not 34.300000000000004). */
export function cleanFloat(value: number): number {
  return excelRound(value, 10);
}

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function blank(v: string | null | undefined): boolean {
  return v == null || v.trim() === '';
}

/** Excel text `=`: case-insensitive. */
export function sameText(a: string | null | undefined, b: string): boolean {
  return a != null && a.trim().toUpperCase() === b.toUpperCase();
}

/** COUNTIF-style prefix criterion (`"Lulus*"`), case-insensitive. */
export function startsWithText(a: string | null | undefined, prefix: string): boolean {
  return a != null && a.trim().toUpperCase().startsWith(prefix.toUpperCase());
}

/** Excel AVERAGE: mean of the numbers, blanks ignored; null when there are none. */
export function average(values: ReadonlyArray<number | null | undefined>): number | null {
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (isNum(v)) {
      sum += v;
      n += 1;
    }
  }
  return n === 0 ? null : sum / n;
}

function asToday(today: DateInput): IsoDate {
  return toIsoDate(today);
}

// ---------------------------------------------------------------------------
// Training baseline (Master SDM L–P)
// ---------------------------------------------------------------------------

/** Master SDM L: `IF(COUNT(J:K)<2,"",ROUND(J*w_rp + K*w_pt, 1))`. */
export function finalResult(
  rolePlay: number | null | undefined,
  postTest: number | null | undefined,
  s: Settings,
): number | null {
  if (!isNum(rolePlay) || !isNum(postTest)) return null;
  return excelRound(rolePlay * s.weightRolePlay + postTest * s.weightPostTest, 1);
}

/** Master SDM N: final ≥ passing grade → Passed, else Failed. */
export function passStatus(final: number | null, s: Settings): Remark | null {
  if (final === null) return null;
  return final >= s.passGrade ? 'Passed' : 'Failed';
}

/** Master SDM O: report remark vs status by the criteria. */
export function consistency(remark: string | null | undefined, status: Remark | null): Consistency | null {
  if (blank(remark) || status === null) return null;
  return sameText(remark, status) ? 'Sama' : 'Beda – verifikasi';
}

/** Master SDM P (PDF slide 25: failure analysis). */
export function failureCause(
  rolePlay: number | null | undefined,
  postTest: number | null | undefined,
  status: Remark | null,
  s: Settings,
): FailureCause | null {
  if (status !== 'Failed') return null;
  if (rolePlay === 0) return 'Kendala operasional & kehadiran (absen role play)';
  if (isNum(postTest) && postTest < s.passGrade) return 'Role play & post-test belum optimal';
  return 'Performa role play belum optimal';
}

export interface StaffBaseline {
  finalResult: number | null;
  status: Remark | null;
  consistency: Consistency | null;
  failureCause: FailureCause | null;
}

/** Master SDM L, N, O, P for one staff row. */
export function staffBaseline(
  staff: Pick<StaffRow, 'rolePlay' | 'postTest' | 'reportRemark'>,
  s: Settings,
): StaffBaseline {
  const final = finalResult(staff.rolePlay, staff.postTest, s);
  const status = passStatus(final, s);
  return {
    finalResult: final,
    status,
    consistency: consistency(staff.reportRemark, status),
    failureCause: failureCause(staff.rolePlay, staff.postTest, status, s),
  };
}

// ---------------------------------------------------------------------------
// Weekly coaching (Log Performa L–N)
// ---------------------------------------------------------------------------

export function scoresOf(row: CoachingScores): Array<number | null> {
  return [row.scoreGrooming, row.scoreKnowledge, row.scoreAttitude, row.scoreCommunication];
}

/** Log L: `IF(COUNT(H:K)=0,"",ROUND(AVERAGE(H:K),2))`. */
export function coachingAvg(scores: ReadonlyArray<number | null | undefined> | CoachingScores): number | null {
  const list = Array.isArray(scores) ? scores : scoresOf(scores as CoachingScores);
  const avg = average(list);
  return avg === null ? null : excelRound(avg, 2);
}

/** Log M: rata-rata ≥ passing grade → Lulus. */
export function coachingStatus(avg: number | null, s: Settings): CoachingStatus | null {
  if (avg === null) return null;
  return avg >= s.passGrade ? 'Lulus' : 'Belum Lulus';
}

/** Log N: weekly average − Final Result. */
export function deltaVsBaseline(weeklyAvg: number | null, baseline: number | null): number | null {
  return weeklyAvg === null || baseline === null ? null : cleanFloat(weeklyAvg - baseline);
}

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

/** Log B: Monday of week n. */
export function weekStart(week: number, s: Settings): IsoDate {
  return addDays(s.week1Start, (week - 1) * 7);
}

/** Laporan C5: last day (Sunday) of week n. */
export function weekEnd(week: number, s: Settings): IsoDate {
  return addDays(weekStart(week, s), 6);
}

/** Monitoring week containing `date` (1 … settings.weeks), or null outside the programme. */
export function weekOfDate(date: DateInput, s: Settings): number | null {
  const n = Math.floor(diffDays(asToday(date), s.week1Start) / 7) + 1;
  return n >= 1 && n <= s.weeks ? n : null;
}

// ---------------------------------------------------------------------------
// Rekap Performa (per staff)
// ---------------------------------------------------------------------------

export interface StaffRekap {
  /** Rekap F: Final Result. */
  baseline: number | null;
  /** Rekap G…: index 0 = week 1 … weeks−1. */
  weekly: Array<number | null>;
  /** Rekap Q: `LOOKUP(9.99E+307, G:P)` = last week that has a score. */
  latest: number | null;
  latestWeek: number | null;
  /** Rekap R: latest − baseline. */
  gain: number | null;
  /** Rekap S. */
  weeksAssessed: number;
  /** Rekap T. */
  currentStatus: CoachingStatus | null;
  /** Rekap U. */
  trend: Trend | null;
}

/** Weekly averages of one staff member; weeks outside 1 … settings.weeks are ignored. */
export function weeklyAverages(rows: readonly WeeklyScoreRow[], s: Settings): Array<number | null> {
  const perWeek: Array<Array<number>> = Array.from({ length: s.weeks }, () => []);
  for (const r of rows) {
    if (!Number.isInteger(r.week) || r.week < 1 || r.week > s.weeks) continue;
    const avg = coachingAvg(r);
    if (avg !== null) perWeek[r.week - 1].push(avg);
  }
  return perWeek.map((xs) => average(xs));
}

export function staffRekap(
  staff: Pick<StaffRow, 'code' | 'rolePlay' | 'postTest'>,
  weeklyRows: readonly WeeklyScoreRow[],
  s: Settings,
): StaffRekap {
  const baseline = finalResult(staff.rolePlay, staff.postTest, s);
  const weekly = weeklyAverages(
    weeklyRows.filter((r) => r.staffCode === staff.code),
    s,
  );
  let latest: number | null = null;
  let latestWeek: number | null = null;
  for (let i = 0; i < weekly.length; i++) {
    const v = weekly[i];
    if (v !== null) {
      latest = v;
      latestWeek = i + 1;
    }
  }
  const gain = latest === null || baseline === null ? null : cleanFloat(latest - baseline);
  return {
    baseline,
    weekly,
    latest,
    latestWeek,
    gain,
    weeksAssessed: weekly.filter((v) => v !== null).length,
    currentStatus: coachingStatus(latest, s),
    trend: trendOf(gain),
  };
}

/** Rekap U: sign of the gain. */
export function trendOf(gain: number | null): Trend | null {
  if (gain === null) return null;
  if (gain > 0) return '▲ Naik';
  if (gain < 0) return '▼ Turun';
  return '= Tetap';
}

// ---------------------------------------------------------------------------
// BMI (Cek BMI 2 Mingguan)
// ---------------------------------------------------------------------------

/** BMI: `ROUND(weight/(height/100)^2, 1)`; null when either is missing. */
export function bmi(heightCm: number | null | undefined, weightKg: number | null | undefined): number | null {
  if (!isNum(heightCm) || !isNum(weightKg) || heightCm <= 0) return null;
  return excelRound(weightKg / (heightCm / 100) ** 2, 1);
}

/** Kategori: on the rounded BMI. < 18.5 Kurus; ≤ 25 Normal; ≤ 27 Overweight; else Obesitas. */
export function bmiCategory(value: number | null, s: Settings): BmiCategory | null {
  if (value === null) return null;
  if (value < s.bmiUnderweightBelow) return 'Kurus';
  if (value <= s.bmiNormalMax) return 'Normal';
  if (value <= s.bmiOverweightMax) return 'Overweight';
  return 'Obesitas';
}

/** Overweight or Obesitas (KPI "BMI overweight"). */
export function isOverweight(category: BmiCategory | null): boolean {
  return category === 'Overweight' || category === 'Obesitas';
}

/** BMI header: planned date of slot p (every bmiIntervalDays from the first check). */
export function bmiCheckDate(period: number, s: Settings): IsoDate {
  return addDays(s.bmiFirstCheck, s.bmiIntervalDays * (period - 1));
}

/** Laporan C6: slot of the week, `MAX(1, MIN(slots, INT((weekStart − first)/14) + 1))`. */
export function bmiPeriodForWeek(week: number, s: Settings): number {
  const k = Math.floor(diffDays(weekStart(week, s), s.bmiFirstCheck) / s.bmiIntervalDays) + 1;
  return Math.max(1, Math.min(s.bmiPeriods, k));
}

/**
 * BMI "Cek Berikutnya": no check yet → first check date; otherwise the last check date plus
 * bmiIntervalDays, for every staff member (the "Ada Catatan BMI" flag does not change the rhythm).
 */
export function nextBmiCheck(lastCheckDate: IsoDate | null, s: Settings): IsoDate {
  if (lastCheckDate === null) return s.bmiFirstCheck;
  return addDays(lastCheckDate, s.bmiIntervalDays);
}

/** BMI "Status Jadwal". */
export function bmiScheduleStatus(next: IsoDate, today: DateInput): BmiScheduleStatus {
  const left = diffDays(next, asToday(today));
  if (left < 0) return 'Terlambat cek';
  if (left <= 7) return 'Cek ≤ 7 hari';
  return 'Terjadwal';
}

export interface BmiPeriodValue {
  period: number;
  checkDate: IsoDate | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  category: BmiCategory | null;
}

export interface BmiSummary {
  /** index 0 = slot 1 … bmiPeriods−1; null when that slot has no row. */
  periods: Array<BmiPeriodValue | null>;
  checks: number;
  lastCheckDate: IsoDate | null;
  latestHeight: number | null;
  latestWeight: number | null;
  latestBmi: number | null;
  latestCategory: BmiCategory | null;
  /** Latest weight − first recorded weight (needs ≥ 2 checks). */
  weightDelta: number | null;
  nextCheck: IsoDate;
  scheduleStatus: BmiScheduleStatus;
}

/** One staff member's BMI row. Slots outside 1 … bmiPeriods are ignored. */
export function bmiSummary(checks: readonly BmiCheckRow[], s: Settings, today: DateInput): BmiSummary {
  const periods: Array<BmiPeriodValue | null> = Array.from({ length: s.bmiPeriods }, () => null);
  for (const c of checks) {
    if (!Number.isInteger(c.period) || c.period < 1 || c.period > s.bmiPeriods) continue;
    const b = bmi(c.heightCm, c.weightKg);
    periods[c.period - 1] = {
      period: c.period,
      checkDate: c.checkDate ?? null,
      heightCm: isNum(c.heightCm) ? c.heightCm : null,
      weightKg: isNum(c.weightKg) ? c.weightKg : null,
      bmi: b,
      category: bmiCategory(b, s),
    };
  }
  const lastOf = <K extends 'heightCm' | 'weightKg' | 'bmi' | 'checkDate'>(key: K) => {
    for (let i = periods.length - 1; i >= 0; i--) {
      const v = periods[i]?.[key];
      if (v != null) return v as NonNullable<BmiPeriodValue[K]>;
    }
    return null;
  };
  const checksCount = periods.filter((p) => isNum(p?.bmi)).length;
  const firstWeight = periods.find((p) => isNum(p?.weightKg))?.weightKg ?? null;
  const latestWeight = lastOf('weightKg');
  const latestBmi = lastOf('bmi');
  const lastCheckDate = lastOf('checkDate');
  const nextCheck = nextBmiCheck(lastCheckDate, s);
  return {
    periods,
    checks: checksCount,
    lastCheckDate,
    latestHeight: lastOf('heightCm'),
    latestWeight,
    latestBmi,
    latestCategory: bmiCategory(latestBmi, s),
    weightDelta:
      checksCount < 2 || latestWeight === null || firstWeight === null ? null : cleanFloat(latestWeight - firstWeight),
    nextCheck,
    scheduleStatus: bmiScheduleStatus(nextCheck, today),
  };
}

// ---------------------------------------------------------------------------
// Tindak Lanjut
// ---------------------------------------------------------------------------

/** Tindak Lanjut Q: null if no due date or status Selesai; due − today. */
export function daysLeft(
  dueDate: IsoDate | null | undefined,
  status: string | null | undefined,
  today: DateInput,
): number | null {
  if (blank(dueDate) || sameText(status, 'Selesai')) return null;
  return diffDays(dueDate!, asToday(today));
}

/**
 * Tindak Lanjut R. Order: Selesai, no due date, overdue, due within 7 days (also Rutin items),
 * Rutin, On Track.
 */
export function actionFlag(
  item: Pick<ActionItemRow, 'dueDate' | 'status' | 'kind'>,
  today: DateInput,
): ActionFlag {
  if (sameText(item.status, 'Selesai')) return 'Selesai';
  if (blank(item.dueDate)) return 'Batas waktu belum ditetapkan';
  const left = diffDays(item.dueDate!, asToday(today));
  if (left < 0) return 'OVERDUE';
  if (left <= 7) return 'Jatuh tempo ≤ 7 hari';
  if (sameText(item.kind, 'Rutin')) return 'Rutin – pantau';
  return 'On Track';
}

// ---------------------------------------------------------------------------
// Remedial
// ---------------------------------------------------------------------------

/** Remedial L/M. */
export function remedialResult(
  r: Pick<RemedialRow, 'action' | 'rolePlay' | 'postTest'>,
  s: Settings,
): { finalResult: number | null; status: RemedialStatus } {
  const final = finalResult(r.rolePlay, r.postTest, s);
  if (final === null) return { finalResult: null, status: blank(r.action) ? 'Belum dijadwalkan' : 'Menunggu hasil' };
  return { finalResult: final, status: final >= s.passGrade ? 'Lulus' : 'Belum Lulus' };
}

// ---------------------------------------------------------------------------
// Penggantian SDM
// ---------------------------------------------------------------------------

/** Penggantian L. */
export function replacementPass(
  r: Pick<ReplacementRow, 'replacementName' | 'postTest' | 'finalResult'>,
  s: Settings,
): ReplacementPass | null {
  if (blank(r.replacementName)) return null;
  if (!isNum(r.postTest) || !isNum(r.finalResult)) return 'Belum training/dinilai';
  return r.postTest >= s.passGrade && r.finalResult >= s.passGrade ? 'Lulus' : 'Belum Lulus';
}

/** Penggantian M. On the deadline day itself a missing effective date is still "Menunggu". */
export function replacementTimeliness(
  r: Pick<ReplacementRow, 'replacedName' | 'effectiveOn'>,
  s: Settings,
  today: DateInput,
): ReplacementTimeliness | null {
  if (blank(r.replacedName)) return null;
  if (blank(r.effectiveOn)) {
    return diffDays(asToday(today), s.replacementDeadline) > 0 ? 'OVERDUE' : 'Menunggu';
  }
  return diffDays(r.effectiveOn!, s.replacementDeadline) <= 0
    ? 'Tepat waktu'
    : `Lewat ${formatTanggalPendek(s.replacementDeadline)}`;
}

// ---------------------------------------------------------------------------
// KPI (Dashboard 1)
// ---------------------------------------------------------------------------

/** Planned end of the BMI KPI window: EDATE(week1Start, targetOverweightMonths). */
export function overweightTargetDate(s: Settings): IsoDate {
  return addMonths(s.week1Start, s.targetOverweightMonths);
}

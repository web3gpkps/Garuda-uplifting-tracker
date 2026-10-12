/*
 * The programme rail's view of the schedule: the monitoring weeks and the BMI check slots,
 * both from Parameter (public.settings). Date math comes from lib/dates and lib/rules, so
 * the rail always agrees with Laporan and the entry screens.
 */
import { diffDays, formatHariTanggal, formatTanggal, formatTanggalPendek, toIsoDate, type IsoDate } from "@/lib/dates";
import { DEFAULT_SETTINGS, bmiCheckDate, weekEnd, weekStart, type Settings } from "@/lib/rules";

/** The settings columns the rail needs, in the DB row's snake_case shape (public.settings). */
export type ProgrammeSettingsRow = {
  week1_start: string;
  weeks: number;
  bmi_first_check: string;
  bmi_interval_days: number;
  /** Interval for staff without a BMI note; only used for the wording. Default from lib/rules. */
  bmi_interval_months?: number;
  bmi_periods: number;
};

/** The rail takes the DB row as-is, or the camelCase Settings used by lib/rules. */
export type ProgrammeSettings = ProgrammeSettingsRow | Settings;

/** Only the schedule fields are read; the rest of Settings is filled with defaults it never uses. */
function asRuleSettings(settings: ProgrammeSettings): Settings {
  if ("week1Start" in settings) return settings;
  return {
    ...DEFAULT_SETTINGS,
    week1Start: settings.week1_start,
    weeks: settings.weeks,
    bmiFirstCheck: settings.bmi_first_check,
    bmiIntervalDays: settings.bmi_interval_days,
    bmiIntervalMonths: settings.bmi_interval_months ?? DEFAULT_SETTINGS.bmiIntervalMonths,
    bmiPeriods: settings.bmi_periods,
  };
}

/**
 * Today's calendar date in Asia/Jakarta as 'YYYY-MM-DD'.
 * Reads the clock: with cacheComponents, call it only at request time (after
 * cookies(), a Supabase query, or `await connection()`), never in a prerendered component.
 */
export function todayInJakarta(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

export type RailWeek = {
  week: number;
  start: IsoDate;
  end: IsoDate;
  /** BMI slot whose planned check date falls in this week, if any. */
  bmiPeriod: number | null;
  bmiDate: IsoDate | null;
  phase: "past" | "current" | "future";
};

export function railWeeks(settings: ProgrammeSettings, today: IsoDate): RailWeek[] {
  const s = asRuleSettings(settings);
  const checks = Array.from({ length: s.bmiPeriods }, (_, i) => ({
    period: i + 1,
    date: bmiCheckDate(i + 1, s),
  }));
  return Array.from({ length: s.weeks }, (_, i) => {
    const week = i + 1;
    const start = weekStart(week, s);
    const end = weekEnd(week, s);
    const check = checks.find((c) => c.date >= start && c.date <= end) ?? null;
    const phase = today < start ? "future" : today > end ? "past" : "current";
    return { week, start, end, bmiPeriod: check?.period ?? null, bmiDate: check?.date ?? null, phase };
  });
}

export type ProgrammeStatus =
  | { phase: "before"; startDate: IsoDate; daysUntilStart: number }
  | { phase: "during"; week: number; start: IsoDate; end: IsoDate }
  | { phase: "after"; endDate: IsoDate };

export function programmeStatus(settings: ProgrammeSettings, today: IsoDate): ProgrammeStatus {
  const s = asRuleSettings(settings);
  const startDate = s.week1Start;
  const endDate = weekEnd(s.weeks, s);
  if (today < startDate) {
    return { phase: "before", startDate, daysUntilStart: diffDays(startDate, today) };
  }
  if (today > endDate) return { phase: "after", endDate };
  const week = Math.floor(diffDays(today, startDate) / 7) + 1;
  return { phase: "during", week, start: weekStart(week, s), end: weekEnd(week, s) };
}

/** The first BMI slot on or after today, or null when the last one has passed. */
export function nextBmiCheck(
  settings: ProgrammeSettings,
  today: IsoDate,
): { period: number; date: IsoDate } | null {
  const s = asRuleSettings(settings);
  for (let period = 1; period <= s.bmiPeriods; period++) {
    const date = bmiCheckDate(period, s);
    if (date >= today) return { period, date };
  }
  return null;
}

/** One honest sentence about where the programme stands today (Bahasa Indonesia). */
export function programmeSummary(settings: ProgrammeSettings, today: IsoDate): string {
  const s = asRuleSettings(settings);
  const status = programmeStatus(s, today);
  const next = nextBmiCheck(s, today);

  let first: string;
  if (status.phase === "before") {
    const when = status.daysUntilStart === 1 ? "besok" : `${status.daysUntilStart} hari lagi`;
    first = `Program belum mulai. Minggu ke-1 dimulai ${formatHariTanggal(status.startDate)} (${when}).`;
  } else if (status.phase === "during") {
    first = `Minggu ke-${status.week} dari ${s.weeks}: ${formatTanggalPendek(status.start)} s.d. ${formatTanggal(status.end)}.`;
  } else {
    first = `Program ${s.weeks} minggu selesai pada ${formatTanggal(status.endDate)}.`;
  }

  let second = "";
  if (next && next.date === today) {
    second = ` Cek BMI ke-${next.period} dijadwalkan hari ini.`;
  } else if (next) {
    second = ` Cek BMI berikutnya: ke-${next.period} dari ${s.bmiPeriods}, ${formatHariTanggal(next.date)}.`;
  } else if (status.phase !== "before") {
    second = ` Cek BMI terakhir (ke-${s.bmiPeriods}) sudah lewat.`;
  }
  return first + second;
}

/** "tiap 14 hari" / "tiap 2 minggu", for the BMI cadence note. */
function everyDays(days: number): string {
  return days % 7 === 0 ? `tiap ${days / 7 === 1 ? "minggu" : `${days / 7} minggu`}` : `tiap ${days} hari`;
}

/**
 * The BMI cadence in one line (slide 15): staff with a BMI note are checked every
 * interval of days, the rest every interval of months.
 * "Cek tiap 2 minggu bagi SDM dengan catatan BMI, bulanan bagi yang lain."
 */
export function bmiCadenceNote(settings: ProgrammeSettings): string {
  const s = asRuleSettings(settings);
  const months = s.bmiIntervalMonths === 1 ? "bulanan" : `tiap ${s.bmiIntervalMonths} bulan`;
  return `Cek ${everyDays(s.bmiIntervalDays)} bagi SDM dengan catatan BMI, ${months} bagi yang lain.`;
}

/** BMI slots planned after the last monitoring week (not on the rail), e.g. slot 6 on 21 Des. */
export function slotsAfterRail(settings: ProgrammeSettings): Array<{ period: number; date: IsoDate }> {
  const s = asRuleSettings(settings);
  const end = weekEnd(s.weeks, s);
  return Array.from({ length: s.bmiPeriods }, (_, i) => ({ period: i + 1, date: bmiCheckDate(i + 1, s) })).filter(
    (slot) => slot.date > end,
  );
}

/** Readable week start for screen readers: "Senin, 19 Okt 2026". */
export function describeWeekStart(start: IsoDate): string {
  return formatHariTanggal(start);
}

/** "26 Okt" for rail cells. */
export function shortDate(date: IsoDate): string {
  return formatTanggalPendek(date);
}


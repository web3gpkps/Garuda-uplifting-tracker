/*
 * Pure view helpers for the Cek BMI screen (no React, no server code), so they are unit
 * tested in summary.test.ts. Formulas stay in lib/rules; these only pick and count.
 */
import { bmiCheckDate, type BmiScheduleStatus, type BmiSummary, type Settings } from "@/lib/rules";
import type { StatusTone } from "@/components/ui/StatusChip";

/** The slot whose planned date is the latest on or before today; slot 1 before the first check. */
export function defaultPeriod(s: Settings, today: string): number {
  let chosen = 1;
  for (let p = 1; p <= s.bmiPeriods; p++) {
    if (bmiCheckDate(p, s) <= today) chosen = p;
  }
  return chosen;
}

export type BmiSlotCounts = {
  staffCount: number;
  checked: number;
  normal: number;
  kurus: number;
  overweight: number;
  obesitas: number;
  /** (Overweight + Obesitas) ÷ checked in this slot, 0..1; null when nobody is checked. */
  pctOverweight: number | null;
  /** From each person's own schedule (nextCheck), not the selected slot. */
  late: number;
  dueSoon: number;
  scheduled: number;
};

/** Counts for one slot over a set of staff summaries (one station, or everyone in view). */
export function slotCounts(summaries: readonly BmiSummary[], period: number): BmiSlotCounts {
  const out: BmiSlotCounts = {
    staffCount: summaries.length,
    checked: 0,
    normal: 0,
    kurus: 0,
    overweight: 0,
    obesitas: 0,
    pctOverweight: null,
    late: 0,
    dueSoon: 0,
    scheduled: 0,
  };
  for (const s of summaries) {
    const slot = s.periods[period - 1] ?? null;
    if (slot && slot.bmi !== null) {
      out.checked += 1;
      if (slot.category === "Normal") out.normal += 1;
      else if (slot.category === "Kurus") out.kurus += 1;
      else if (slot.category === "Overweight") out.overweight += 1;
      else if (slot.category === "Obesitas") out.obesitas += 1;
    }
    if (s.scheduleStatus === "Terlambat cek") out.late += 1;
    else if (s.scheduleStatus === "Cek ≤ 7 hari") out.dueSoon += 1;
    else out.scheduled += 1;
  }
  out.pctOverweight = out.checked === 0 ? null : (out.overweight + out.obesitas) / out.checked;
  return out;
}

/** "Ada catatan BMI" as the workbook shows it. */
export function hasNoteLabel(value: boolean | null | undefined): "Ya" | "Tidak" | null {
  if (value === true) return "Ya";
  if (value === false) return "Tidak";
  return null;
}

/** "Ya" / "Tidak" (any case) back to the stored boolean; anything else is "not filled in". */
export function parseHasNote(value: unknown): boolean | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  if (t === "ya") return true;
  if (t === "tidak") return false;
  return null;
}

/**
 * How often this person is checked (lib/rules nextBmiCheck): no note ("Tidak") monthly,
 * otherwise (Ya, or not filled in) every bmiIntervalDays.
 */
export function checkRhythm(hasNote: boolean | null | undefined, s: Settings): string {
  if (hasNote === false) return s.bmiIntervalMonths === 1 ? "tiap bulan" : `tiap ${s.bmiIntervalMonths} bulan`;
  return `tiap ${s.bmiIntervalDays} hari`;
}

/** Tone for "Status jadwal" (set explicitly so it never depends on the shared label table). */
export function scheduleTone(status: BmiScheduleStatus | string | null | undefined): StatusTone {
  if (status === "Terlambat cek") return "critical";
  if (status === "Cek ≤ 7 hari") return "warning";
  if (status === "Terjadwal") return "good";
  return "neutral";
}

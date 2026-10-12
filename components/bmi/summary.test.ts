import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, bmiSummary, type BmiCheckRow, type Settings } from "@/lib/rules";
import { checkRhythm, defaultPeriod, hasNoteLabel, parseHasNote, scheduleTone, slotCounts } from "./summary";

const s: Settings = { ...DEFAULT_SETTINGS, bmiFirstCheck: "2026-10-12", bmiIntervalDays: 14, bmiPeriods: 6 };

describe("defaultPeriod", () => {
  test("slot 1 before the first check", () => {
    expect(defaultPeriod(s, "2026-10-01")).toBe(1);
  });
  test("latest planned slot on or before today", () => {
    expect(defaultPeriod(s, "2026-10-26")).toBe(2);
    expect(defaultPeriod(s, "2026-11-08")).toBe(2);
    expect(defaultPeriod(s, "2026-11-09")).toBe(3);
  });
  test("never past the last slot", () => {
    expect(defaultPeriod(s, "2027-06-01")).toBe(6);
  });
});

describe("slotCounts", () => {
  const today = "2026-10-20";
  const check = (period: number, heightCm: number, weightKg: number, checkDate: string): BmiCheckRow => ({
    staffCode: "IULS-01",
    period,
    heightCm,
    weightKg,
    checkDate,
  });
  // Dummy A: normal in slot 1. Dummy B: obese in slot 1. Dummy C: not checked yet.
  const a = bmiSummary([check(1, 170, 60, "2026-10-12")], true, s, today);
  const b = bmiSummary([check(1, 160, 90, "2026-10-12")], false, s, today);
  const c = bmiSummary([], null, s, today);

  test("counts categories in the chosen slot", () => {
    const counts = slotCounts([a, b, c], 1);
    expect(counts.staffCount).toBe(3);
    expect(counts.checked).toBe(2);
    expect(counts.normal).toBe(1);
    expect(counts.obesitas).toBe(1);
    expect(counts.pctOverweight).toBe(0.5);
  });

  test("an empty slot has no overweight share", () => {
    const counts = slotCounts([a, b, c], 2);
    expect(counts.checked).toBe(0);
    expect(counts.pctOverweight).toBeNull();
  });

  test("schedule status comes from each person's own rhythm", () => {
    // a: note → next 26 Okt (≤ 7 hari); b: no note → next 12 Nov (Terjadwal); c: never checked → 12 Okt (late).
    const counts = slotCounts([a, b, c], 1);
    expect(counts.dueSoon).toBe(1);
    expect(counts.scheduled).toBe(1);
    expect(counts.late).toBe(1);
  });
});

describe("Ada catatan BMI", () => {
  test("labels and parsing round-trip", () => {
    expect(hasNoteLabel(true)).toBe("Ya");
    expect(hasNoteLabel(false)).toBe("Tidak");
    expect(hasNoteLabel(null)).toBeNull();
    expect(parseHasNote("Ya")).toBe(true);
    expect(parseHasNote(" tidak ")).toBe(false);
    expect(parseHasNote("")).toBeNull();
    expect(parseHasNote(null)).toBeNull();
  });

  test("rhythm follows the note", () => {
    expect(checkRhythm(true, s)).toBe("tiap 14 hari");
    expect(checkRhythm(null, s)).toBe("tiap 14 hari");
    expect(checkRhythm(false, s)).toBe("tiap bulan");
  });

  test("schedule tones", () => {
    expect(scheduleTone("Terlambat cek")).toBe("critical");
    expect(scheduleTone("Cek ≤ 7 hari")).toBe("warning");
    expect(scheduleTone("Terjadwal")).toBe("good");
  });
});

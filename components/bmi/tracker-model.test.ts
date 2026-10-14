import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, TOUCH_POINTS, type Settings } from "@/lib/rules";
import {
  applyEdit,
  filterViews,
  isCheckedIn,
  summarizeRow,
  summaryOf,
  touchPointsOf,
  trackerMetrics,
  type BmiRowView,
  type BmiTrackerRow,
} from "./tracker-model";

// 6 is only the fixture here; the model takes the length from the settings (see "another number of periods").
const settings: Settings = { ...DEFAULT_SETTINGS, bmiFirstCheck: "2026-10-12", bmiIntervalDays: 14, bmiPeriods: 6 };
const today = "2026-10-20";

function emptyChecks(periods: number): BmiTrackerRow["checks"] {
  return Array.from({ length: periods }, () => null);
}

function row(code: string, name: string, patch: Partial<BmiTrackerRow> = {}): BmiTrackerRow {
  return {
    code,
    name,
    station: "AAA",
    touchPoint: null,
    gender: "L",
    feedback: null,
    remarks: null,
    hasNote: true,
    fitnessNote: null,
    assignmentStatus: "Aktif",
    changed: null,
    checks: emptyChecks(settings.bmiPeriods),
    ...patch,
  };
}

const withCheck = (period: number, heightCm: number, weightKg: number, date: string, periods = settings.bmiPeriods) => {
  const checks = emptyChecks(periods);
  checks[period - 1] = { date, heightCm, weightKg };
  return checks;
};

// T-01: normal in period 1 (next check 26 Okt, due soon). T-02: obese, checked 19 Okt
// (next check 2 Nov, scheduled). T-03: never checked (late).
const rows = [
  row("T-01", "Petugas Satu", { checks: withCheck(1, 170, 60, "2026-10-12"), touchPoint: "Boarding Gate" }),
  row("T-02", "Petugas Dua", { checks: withCheck(1, 160, 90, "2026-10-19"), hasNote: false, touchPoint: "Baggage Service" }),
  row("T-03", "Petugas Tiga"),
];
const views: BmiRowView[] = rows.map((r) => ({ row: r, summary: summarizeRow(r, settings, today) }));
const base = { query: "", status: "all" as const, touchPoint: "", period: 1 };
const codes = (list: BmiRowView[]) => list.map((v) => v.row.code);

describe("summarizeRow", () => {
  test("builds the BMI summary from the stored checks", () => {
    expect(views[0].summary.latestBmi).toBe(20.8);
    expect(views[0].summary.latestCategory).toBe("Normal");
    expect(views[1].summary.latestCategory).toBe("Obesitas");
    expect(views[2].summary.latestBmi).toBeNull();
    expect(isCheckedIn(views[0].summary, 1)).toBe(true);
    expect(isCheckedIn(views[0].summary, 2)).toBe(false);
  });

  test("everyone is checked on the same rhythm, with or without a BMI note", () => {
    // T-01 (note: yes) and T-02 (note: no) were both last checked in period 1: next check is one interval later.
    expect(views[0].summary.nextCheck).toBe("2026-10-26");
    expect(views[1].summary.nextCheck).toBe("2026-11-02");
    const without = summarizeRow({ ...rows[1], hasNote: true }, settings, today);
    const unset = summarizeRow({ ...rows[1], hasNote: null }, settings, today);
    expect(without.nextCheck).toBe(views[1].summary.nextCheck);
    expect(unset.nextCheck).toBe(views[1].summary.nextCheck);
  });
});

describe("summaryOf", () => {
  test("is the same summary object for the same row, a new one for an edited row", () => {
    const first = summaryOf(rows[0], settings, today);
    expect(summaryOf(rows[0], settings, today)).toBe(first);
    const [edited] = applyEdit(rows, { type: "check", code: "T-01", period: 2, check: { date: "2026-10-26", heightCm: 170, weightKg: 62 } });
    expect(summaryOf(edited, settings, today)).not.toBe(first);
    expect(summaryOf(edited, settings, today).checks).toBe(2);
    expect(summaryOf(rows[0], settings, "2026-10-21")).not.toBe(first);
  });
});

describe("filterViews", () => {
  test("search matches the name or the ID, any case, and trims", () => {
    expect(codes(filterViews(views, { ...base, query: "  dua " }))).toEqual(["T-02"]);
    expect(codes(filterViews(views, { ...base, query: "t-03" }))).toEqual(["T-03"]);
    expect(filterViews(views, { ...base, query: "tidak ada" })).toEqual([]);
  });

  test("status filters follow the schedule and the chosen period", () => {
    expect(codes(filterViews(views, { ...base, status: "late" }))).toEqual(["T-03"]);
    expect(codes(filterViews(views, { ...base, status: "due" }))).toEqual(["T-01"]);
    expect(codes(filterViews(views, { ...base, status: "checked" }))).toEqual(["T-01", "T-02"]);
    expect(codes(filterViews(views, { ...base, status: "pending" }))).toEqual(["T-03"]);
    expect(codes(filterViews(views, { ...base, status: "checked", period: 2 }))).toEqual([]);
    expect(codes(filterViews(views, { ...base, status: "pending", period: 2 }))).toEqual(["T-01", "T-02", "T-03"]);
  });

  test("touch point and search combine and the order is kept", () => {
    expect(codes(filterViews(views, { ...base, touchPoint: "Baggage Service" }))).toEqual(["T-02"]);
    expect(codes(filterViews(views, { ...base, touchPoint: "Baggage Service", query: "satu" }))).toEqual([]);
    expect(codes(filterViews(views, base))).toEqual(["T-01", "T-02", "T-03"]);
  });

  test("a touch point the owner typed is a filter value too; a person without one never matches", () => {
    const free = [...views, { row: row("T-04", "Petugas Empat", { touchPoint: " Lounge Utama " }), summary: views[2].summary }];
    expect(codes(filterViews(free, { ...base, touchPoint: "Lounge Utama" }))).toEqual(["T-04"]);
    expect(codes(filterViews(free, { ...base, touchPoint: "Boarding Gate" }))).toEqual(["T-01"]);
  });
});

describe("touchPointsOf", () => {
  test("is empty while nobody has a touch point, so the filter is not shown", () => {
    expect(touchPointsOf([{ touchPoint: null }, { touchPoint: "" }, { touchPoint: "  " }])).toEqual([]);
    expect(touchPointsOf([])).toEqual([]);
  });
  test("lists the five standard values in their order as soon as one person has a touch point", () => {
    expect(touchPointsOf(rows)).toEqual([...TOUCH_POINTS]);
    expect(touchPointsOf([{ touchPoint: "Boarding Gate" }])).toEqual([...TOUCH_POINTS]);
  });
  test("adds any other value in the data once, after the standard ones, sorted and trimmed", () => {
    const list = touchPointsOf([
      { touchPoint: "Lounge Utama" },
      { touchPoint: " Cargo " },
      { touchPoint: "Lounge Utama" },
      { touchPoint: "Boarding Gate" },
      { touchPoint: null },
    ]);
    expect(list).toEqual([...TOUCH_POINTS, "Cargo", "Lounge Utama"]);
  });
});

describe("trackerMetrics", () => {
  test("counts the chosen period, late checks and the latest BMI above normal", () => {
    expect(trackerMetrics(views, 1)).toEqual({ total: 3, checked: 2, checkedPct: 67, late: 1, aboveNormal: 1 });
    expect(trackerMetrics(views, 2).checked).toBe(0);
  });
  test("nobody means zeros, never NaN", () => {
    expect(trackerMetrics([], 1)).toEqual({ total: 0, checked: 0, checkedPct: 0, late: 0, aboveNormal: 0 });
  });
});

describe("applyEdit", () => {
  test("a saved check replaces one period and leaves other rows untouched", () => {
    const next = applyEdit(rows, {
      type: "check",
      code: "T-03",
      period: 2,
      check: { date: "2026-10-26", heightCm: 165, weightKg: 70 },
    });
    expect(next[2].checks[1]).toEqual({ date: "2026-10-26", heightCm: 165, weightKg: 70 });
    expect(next[0]).toBe(rows[0]);
    expect(rows[2].checks[1]).toBeNull();
    expect(summarizeRow(next[2], settings, today).latestBmi).toBe(25.7);
  });

  test("deleting a check empties the period", () => {
    const next = applyEdit(rows, { type: "check", code: "T-01", period: 1, check: null });
    expect(next[0].checks[0]).toBeNull();
    expect(summarizeRow(next[0], settings, today).latestBmi).toBeNull();
  });

  test("a profile edit changes only the given fields", () => {
    const next = applyEdit(rows, { type: "profile", code: "T-02", patch: { hasNote: true } });
    expect(next[1].hasNote).toBe(true);
    expect(next[1].fitnessNote).toBeNull();
    expect(next[1].name).toBe("Petugas Dua");
  });
});

describe("another number of periods", () => {
  // Parameter allows 1 to 52 checks; the model must not care.
  for (const periods of [1, 8, 26, 52]) {
    const s: Settings = { ...settings, bmiPeriods: periods };

    test(`${periods} periods: summary, metrics, filters and edits work on the last period`, () => {
      const last = periods;
      const person = row("L-01", "Petugas Akhir", { checks: withCheck(last, 170, 60, "2027-03-01", periods) });
      const never = row("L-02", "Petugas Baru", { checks: emptyChecks(periods) });
      const list = [person, never].map((r) => ({ row: r, summary: summarizeRow(r, s, "2027-03-02") }));

      expect(list[0].summary.periods).toHaveLength(periods);
      expect(isCheckedIn(list[0].summary, last)).toBe(true);
      expect(isCheckedIn(list[0].summary, 1)).toBe(periods === 1);
      expect(trackerMetrics(list, last).checked).toBe(1);
      expect(codes(filterViews(list, { ...base, status: "checked", period: last }))).toEqual(["L-01"]);
      expect(codes(filterViews(list, { ...base, status: "pending", period: last }))).toEqual(["L-02"]);

      const next = applyEdit([person, never], { type: "check", code: "L-02", period: last, check: { date: "2027-03-02", heightCm: 160, weightKg: 50 } });
      expect(next[1].checks).toHaveLength(periods);
      expect(next[1].checks[last - 1]).toEqual({ date: "2027-03-02", heightCm: 160, weightKg: 50 });
      expect(summarizeRow(next[1], s, "2027-03-02").checks).toBe(1);
    });
  }

  test("a stored check beyond the periods in Parameter is not counted", () => {
    const s: Settings = { ...settings, bmiPeriods: 8 };
    const long = row("L-03", "Petugas Panjang", { checks: withCheck(10, 170, 60, "2027-02-01", 12) });
    expect(summarizeRow(long, s, "2027-03-02").checks).toBe(0);
  });
});

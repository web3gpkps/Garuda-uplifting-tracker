import { describe, expect, test } from "bun:test";
import {
  bmiCadenceNote,
  nextBmiCheck,
  programmeStatus,
  programmeSummary,
  railWeeks,
  slotsAfterRail,
  type ProgrammeSettingsRow,
} from "./programme-calendar";

// Parameter defaults of the Garuda workbook: 10 weeks from Mon 5 Okt 2026, 6 BMI slots every 14 days from 12 Okt.
const settings: ProgrammeSettingsRow = {
  week1_start: "2026-10-05",
  weeks: 10,
  bmi_first_check: "2026-10-12",
  bmi_interval_days: 14,
  bmi_interval_months: 1,
  bmi_periods: 6,
};

describe("railWeeks", () => {
  test("follows the weeks in Parameter and marks the weeks holding a BMI slot", () => {
    const weeks = railWeeks(settings, "2026-10-14");
    expect(weeks).toHaveLength(10);
    expect(weeks[0]).toMatchObject({ week: 1, start: "2026-10-05", end: "2026-10-11", bmiPeriod: null, phase: "past" });
    expect(weeks[1]).toMatchObject({ week: 2, bmiPeriod: 1, bmiDate: "2026-10-12", phase: "current" });
    expect(weeks.filter((w) => w.bmiPeriod).map((w) => w.bmiPeriod)).toEqual([1, 2, 3, 4, 5]);
    expect(railWeeks({ ...settings, weeks: 12 }, "2026-10-14")).toHaveLength(12);
  });
});

describe("slotsAfterRail", () => {
  test("slot 6 (21 Des) falls after week 10 ends on 13 Des", () => {
    expect(slotsAfterRail(settings)).toEqual([{ period: 6, date: "2026-12-21" }]);
    expect(slotsAfterRail({ ...settings, weeks: 12 })).toEqual([]);
  });
});

describe("programme status and summary", () => {
  test("before, during and after the monitoring weeks", () => {
    expect(programmeStatus(settings, "2026-10-01")).toMatchObject({ phase: "before", daysUntilStart: 4 });
    expect(programmeStatus(settings, "2026-10-14")).toMatchObject({ phase: "during", week: 2 });
    expect(programmeStatus(settings, "2026-12-14")).toMatchObject({ phase: "after", endDate: "2026-12-13" });
  });

  test("the next BMI slot is the first on or after today, up to the last slot", () => {
    expect(nextBmiCheck(settings, "2026-10-13")).toEqual({ period: 2, date: "2026-10-26" });
    expect(nextBmiCheck(settings, "2026-12-21")).toEqual({ period: 6, date: "2026-12-21" });
    expect(nextBmiCheck(settings, "2026-12-22")).toBeNull();
  });

  test("the sentence names the week and the next check", () => {
    expect(programmeSummary(settings, "2026-10-14")).toBe(
      "Minggu ke-2 dari 10: 12 Okt s.d. 18 Okt 2026. Cek BMI berikutnya: ke-2 dari 6, Senin, 26 Okt 2026.",
    );
    expect(programmeSummary(settings, "2026-10-12")).toContain("Cek BMI ke-1 dijadwalkan hari ini.");
  });
});

describe("bmiCadenceNote", () => {
  test("two-weekly with a BMI note, monthly otherwise", () => {
    expect(bmiCadenceNote(settings)).toBe("Cek tiap 2 minggu bagi SDM dengan catatan BMI, bulanan bagi yang lain.");
    expect(bmiCadenceNote({ ...settings, bmi_interval_days: 10, bmi_interval_months: 2 })).toBe(
      "Cek tiap 10 hari bagi SDM dengan catatan BMI, tiap 2 bulan bagi yang lain.",
    );
  });

  test("a row without bmi_interval_months falls back to monthly", () => {
    const withoutMonths: ProgrammeSettingsRow = { ...settings };
    delete withoutMonths.bmi_interval_months;
    expect(bmiCadenceNote(withoutMonths)).toContain("bulanan");
  });
});

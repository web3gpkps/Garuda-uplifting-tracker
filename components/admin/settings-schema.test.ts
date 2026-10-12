import { describe, expect, test } from "bun:test";
import { SETTING_FIELDS, settingsToFormValues, validateSettings, weightSum, type SettingsValues } from "./settings-schema";

const row = {
  week1_start: "2026-10-05",
  weeks: 10,
  bmi_first_check: "2026-10-12",
  bmi_interval_days: 14,
  bmi_interval_months: 1,
  bmi_periods: 6,
  bmi_underweight_below: 18.5,
  bmi_normal_max: 25,
  bmi_overweight_max: 27,
  pass_grade: 85,
  weight_role_play: 0.4,
  weight_post_test: 0.6,
  target_overweight_max: 0.2,
  target_overweight_months: 6,
  target_knowledge: 0.9,
  target_interactive: 0.92,
  target_coverage: 812,
  coverage_done: 795,
  target_pass_rate: 1,
  replacement_deadline: "2026-12-14",
};

describe("settings form", () => {
  test("covers every editable settings column", () => {
    expect(SETTING_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(row).sort());
  });

  test("shows fractions as percentages and decimals with a comma", () => {
    const values = settingsToFormValues(row);
    expect(values.target_interactive).toBe("92");
    expect(values.weight_role_play).toBe("40");
    expect(values.target_pass_rate).toBe("100");
    expect(values.bmi_underweight_below).toBe("18,5");
    expect(values.week1_start).toBe("2026-10-05");
  });

  test("round-trips the workbook defaults back to fractions", () => {
    const { errors, update } = validateSettings(settingsToFormValues(row));
    expect(errors).toEqual({});
    expect(update).toEqual(row);
  });

  test("accepts decimal percentages with a comma", () => {
    const values: SettingsValues = { ...settingsToFormValues(row), target_knowledge: "92,5" };
    expect(validateSettings(values).update?.target_knowledge).toBe(0.925);
  });

  test("refuses what the CHECK constraints refuse", () => {
    const values: SettingsValues = {
      ...settingsToFormValues(row),
      weeks: "21",
      bmi_interval_months: "0",
      bmi_periods: "13",
      bmi_normal_max: "30",
      pass_grade: "101",
      weight_post_test: "120",
      target_overweight_months: "40",
      target_coverage: "0",
      coverage_done: "-1",
      replacement_deadline: "2026-02-30",
    };
    const { errors, update } = validateSettings(values);
    expect(update).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(
      [
        "bmi_interval_months",
        "bmi_normal_max",
        "bmi_periods",
        "coverage_done",
        "pass_grade",
        "replacement_deadline",
        "target_coverage",
        "target_overweight_months",
        "weeks",
        "weight_post_test",
      ].sort(),
    );
  });

  test("whole numbers only where the column is an integer", () => {
    const { errors } = validateSettings({ ...settingsToFormValues(row), target_coverage: "812,5" });
    expect(errors.target_coverage).toBe("Isi bilangan bulat.");
  });

  test("weight sum is reported for the 100 % note", () => {
    expect(weightSum({ weight_role_play: "40", weight_post_test: "60" })).toBe(100);
    expect(weightSum({ weight_role_play: "40", weight_post_test: "50,5" })).toBe(90.5);
    expect(weightSum({ weight_role_play: "", weight_post_test: "60" })).toBeNull();
  });
});

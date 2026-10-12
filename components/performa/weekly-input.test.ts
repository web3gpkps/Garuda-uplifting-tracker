import { describe, expect, test } from "bun:test";
import { ASPECT_FIELDS, parseScore, toneOf } from "./format";
import { checkWeeklyInput, weeklyArgs, type WeeklyScoreInput } from "./weekly-input";

const INPUT: WeeklyScoreInput = {
  staffCode: "IULS-01",
  week: 2,
  touchPoint: "Boarding Gate",
  scores: [90, 87.5, null, 100],
  gapTopic: "GA Miles",
  observer: "Dummy B",
  coachingNotes: null,
};

test("aspect fields follow COACHING_ASPECTS", () => {
  expect(ASPECT_FIELDS.map((a) => a.field)).toEqual([
    "score_grooming",
    "score_knowledge",
    "score_attitude",
    "score_communication",
  ]);
});

test("parseScore: 0 to 100, decimal comma, at most two decimals", () => {
  expect(parseScore(" 87,5 ")).toBe(87.5);
  expect(parseScore("0")).toBe(0);
  expect(parseScore("100")).toBe(100);
  expect(parseScore("")).toBeNull();
  for (const bad of ["101", "-1", "8,555", "x", "1e2"]) expect(parseScore(bad)).toBe("invalid");
});

test("tones follow the workbook colours", () => {
  expect(toneOf("Lulus")).toBe("good");
  expect(toneOf("Belum Lulus")).toBe("critical");
  expect(toneOf("Beda – verifikasi")).toBe("warning");
  expect(toneOf(null)).toBe("neutral");
});

describe("checkWeeklyInput", () => {
  test("accepts a Garuda weekly row", () => {
    expect(checkWeeklyInput(INPUT)).toBeNull();
  });

  test("names the field that is wrong", () => {
    expect(checkWeeklyInput({ ...INPUT, week: 0 })?.field).toBe("week");
    expect(checkWeeklyInput({ ...INPUT, staffCode: " " })?.field).toBe("staff_code");
    expect(checkWeeklyInput({ ...INPUT, touchPoint: "Lounge" })?.field).toBe("touch_point");
    expect(checkWeeklyInput({ ...INPUT, scores: [90, 101, null, null] })?.field).toBe("score_knowledge");
    expect(checkWeeklyInput({ ...INPUT, scores: [90] })?.field).toBe("score_grooming");
    expect(checkWeeklyInput({ ...INPUT, observer: "o".repeat(201) })?.field).toBe("observer");
  });
});

test("weeklyArgs maps the aspects in order and blanks to NULL", () => {
  expect(weeklyArgs({ ...INPUT, observer: " ", gapTopic: "" })).toEqual({
    p_staff_code: "IULS-01",
    p_week: 2,
    p_touch_point: "Boarding Gate",
    p_score_grooming: 90,
    p_score_knowledge: 87.5,
    p_score_attitude: null as unknown as number,
    p_score_communication: 100,
    p_gap_topic: null as unknown as string,
    p_observer: null as unknown as string,
    p_coaching_notes: null as unknown as string,
  });
});

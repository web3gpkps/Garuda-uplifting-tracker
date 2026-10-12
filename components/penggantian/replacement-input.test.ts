import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, replacementPass } from "@/lib/rules";
import { checkReplacementInput, type ReplacementInput } from "./replacement-input";

const INPUT: ReplacementInput = {
  id: null,
  program: "IULS",
  station: "CGK",
  staffCode: null,
  replacedName: "Dummy A",
  reason: "Ditarik dari layanan",
  withdrawnOn: "2026-10-12",
  replacementName: "Dummy B",
  effectiveOn: "2026-11-02",
  trainingOn: "2026-10-26",
  postTest: 88,
  finalResult: 86.5,
  reported: "Belum",
  notes: null,
};

describe("checkReplacementInput", () => {
  test("accepts a complete row and an all-optional one", () => {
    expect(checkReplacementInput(INPUT)).toBeNull();
    expect(
      checkReplacementInput({
        ...INPUT,
        program: null,
        reason: null,
        withdrawnOn: null,
        replacementName: null,
        effectiveOn: null,
        trainingOn: null,
        postTest: null,
        finalResult: null,
        reported: null,
      }),
    ).toBeNull();
  });
  test("a roster pick may leave the name to the database", () => {
    expect(checkReplacementInput({ ...INPUT, replacedName: null, staffCode: "IULS-01" })).toBeNull();
    expect(checkReplacementInput({ ...INPUT, replacedName: " " })?.field).toBe("replaced_name");
  });
  test("names the DB column of the first bad field", () => {
    expect(checkReplacementInput({ ...INPUT, id: 1.5 })?.field).toBe("id");
    expect(checkReplacementInput({ ...INPUT, program: "TMB" })?.field).toBe("program");
    expect(checkReplacementInput({ ...INPUT, effectiveOn: "2026-02-30" })?.field).toBe("effective_on");
    expect(checkReplacementInput({ ...INPUT, postTest: 101 })?.field).toBe("post_test");
    expect(checkReplacementInput({ ...INPUT, finalResult: -1 })?.field).toBe("final_result");
    expect(checkReplacementInput({ ...INPUT, finalResult: Number.NaN })?.field).toBe("final_result");
    expect(checkReplacementInput({ ...INPUT, reported: "Sudah" as never })?.field).toBe("reported");
  });
});

describe("pass grade on the 0-100 final result (lib/rules)", () => {
  test("both post-test and final result at or above pass_grade", () => {
    expect(replacementPass(INPUT, DEFAULT_SETTINGS)).toBe("Lulus");
    expect(replacementPass({ ...INPUT, finalResult: 84.9 }, DEFAULT_SETTINGS)).toBe("Belum Lulus");
    expect(replacementPass({ ...INPUT, finalResult: null }, DEFAULT_SETTINGS)).toBe("Belum training/dinilai");
  });
});

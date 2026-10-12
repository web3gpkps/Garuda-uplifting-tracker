import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "@/lib/rules";
import type { WorkspaceStaff } from "@/lib/workspace";
import { MATCHES, parseCheck, parseProgram, toRows } from "./rows";

function staff(code: string, fields: Partial<WorkspaceStaff>): WorkspaceStaff {
  return {
    code,
    program: "IULS",
    provider: null,
    station: "CGK",
    name: `Dummy ${code}`,
    employeeNo: null,
    gender: null,
    touchPoint: null,
    rolePlay: null,
    postTest: null,
    reportRemark: null,
    assignmentStatus: "Aktif",
    feedback: null,
    notes: null,
    bmiHasNote: null,
    bmiNote: null,
    sortOrder: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    updatedByLink: null,
    ...fields,
  };
}

const WS = {
  linkId: "link-1",
  linkLabels: {},
  weeklyScores: [{ staffCode: "IULS-01" }, { staffCode: "IULS-01" }],
  bmiChecks: [{ staffCode: "IULS-01" }],
  remedials: [{ staffCode: "IULS-02" }],
  replacements: [{ staffCode: null }],
} as unknown as Parameters<typeof toRows>[0];

describe("toRows", () => {
  const rows = toRows(
    WS,
    [
      staff("IULS-01", { rolePlay: 90, postTest: 88, reportRemark: "Passed" }),
      staff("IULS-02", { rolePlay: 0, postTest: 90, reportRemark: "Passed" }),
      staff("RUST-003", { program: "RUST", rolePlay: 95, postTest: 70, reportRemark: "Failed" }),
      staff("TMB-01", { program: null }),
    ],
    DEFAULT_SETTINGS,
  );
  const [passed, absent, failed, added] = rows;

  test("computes Final Result, status, consistency and cause with lib/rules", () => {
    expect(passed).toMatchObject({ finalResult: 88.8, status: "Passed", consistency: "Sama", failureCause: null });
    expect(absent).toMatchObject({
      finalResult: 54,
      status: "Failed",
      consistency: "Beda – verifikasi",
      failureCause: "Kendala operasional & kehadiran (absen role play)",
    });
    expect(failed).toMatchObject({ finalResult: 80, status: "Failed", consistency: "Sama" });
    expect(added).toMatchObject({ finalResult: null, status: null, consistency: null, failureCause: null });
  });

  test("counts the rows that go with a delete", () => {
    expect(passed).toMatchObject({ weeklyScoreCount: 2, bmiCheckCount: 1, remedialCount: 0 });
    expect(absent.remedialCount).toBe(1);
  });

  test("flags", () => {
    expect(rows.filter(MATCHES.beda).map((r) => r.code)).toEqual(["IULS-02"]);
    expect(rows.filter(MATCHES.failed).map((r) => r.code)).toEqual(["IULS-02", "RUST-003"]);
    expect(rows.filter(MATCHES.absen).map((r) => r.code)).toEqual(["IULS-02"]);
  });
});

test("query params", () => {
  expect(parseProgram("rust")).toBe("RUST");
  expect(parseProgram(["IULS"])).toBe("IULS");
  expect(parseProgram("JOUMPA")).toBeNull();
  expect(parseCheck("absen")).toBe("absen");
  expect(parseCheck("nipp-ganda")).toBeNull();
});

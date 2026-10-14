import { describe, expect, test } from "bun:test";
import {
  baselineArgs,
  checkBaseline,
  checkProfile,
  profileArgs,
  staffFieldMessage,
  type StaffProfileInput,
} from "./staff-input";

const PROFILE: StaffProfileInput = {
  code: "IULS-01",
  program: "IULS",
  provider: "Provider Dummy",
  station: "CGK",
  name: "Dummy A",
  employeeNo: "E-0001",
  gender: "P",
  touchPoint: "Check-in Counter",
  assignmentStatus: "Aktif",
  notes: null,
};

describe("checkProfile", () => {
  test("accepts a complete Garuda profile", () => {
    expect(checkProfile(PROFILE)).toBeNull();
    expect(checkProfile({ ...PROFILE, program: null, gender: "", touchPoint: null, notes: "  " })).toBeNull();
  });

  test("names the field that is wrong", () => {
    expect(checkProfile({ ...PROFILE, name: "  " })?.field).toBe("name");
    expect(checkProfile({ ...PROFILE, program: "JOUMPA" })?.field).toBe("program");
    expect(checkProfile({ ...PROFILE, gender: "X" })?.field).toBe("gender");
    expect(checkProfile({ ...PROFILE, touchPoint: "Lounge" })).toBeNull();
    expect(checkProfile({ ...PROFILE, touchPoint: "x".repeat(61) })?.field).toBe("touch_point");
    expect(checkProfile({ ...PROFILE, assignmentStatus: "Diganti" })?.field).toBe("assignment_status");
    expect(checkProfile({ ...PROFILE, employeeNo: "9".repeat(51) })?.field).toBe("employee_no");
    expect(checkProfile({ ...PROFILE, provider: "p".repeat(101) })?.field).toBe("provider");
  });
});

describe("checkBaseline", () => {
  test("role play and post-test are 0 to 100, decimals allowed", () => {
    expect(checkBaseline({ rolePlay: 0, postTest: 87.5, reportRemark: "Failed", feedback: null })).toBeNull();
    expect(checkBaseline({ rolePlay: null, postTest: null, reportRemark: null, feedback: null })).toBeNull();
    expect(checkBaseline({ rolePlay: 101, postTest: 80, reportRemark: null, feedback: null })?.field).toBe("role_play");
    expect(checkBaseline({ rolePlay: 80, postTest: -1, reportRemark: null, feedback: null })?.field).toBe("post_test");
    expect(checkBaseline({ rolePlay: 80, postTest: Number.NaN, reportRemark: null, feedback: null })?.field).toBe("post_test");
  });

  test("remark is Passed or Failed", () => {
    expect(checkBaseline({ rolePlay: 90, postTest: 90, reportRemark: "Lulus", feedback: null })?.field).toBe("report_remark");
  });
});

describe("RPC arguments", () => {
  test("share_save_staff gets every profile field, blanks as NULL", () => {
    expect(profileArgs({ ...PROFILE, provider: " ", notes: "" })).toEqual({
      p_code: "IULS-01",
      p_program: "IULS",
      p_provider: null as unknown as string,
      p_station: "CGK",
      p_name: "Dummy A",
      p_employee_no: "E-0001",
      p_gender: "P",
      p_touch_point: "Check-in Counter",
      p_assignment_status: "Aktif",
      p_notes: null as unknown as string,
    });
  });

  test("a new staff member sends a NULL code", () => {
    expect(profileArgs({ ...PROFILE, code: null }).p_code).toBeNull();
  });

  test("share_kps_save_staff_baseline gets the full baseline", () => {
    expect(baselineArgs("RUST-018", { rolePlay: 0, postTest: 80, reportRemark: "Failed", feedback: " " })).toEqual({
      p_code: "RUST-018",
      p_role_play: 0,
      p_post_test: 80,
      p_report_remark: "Failed",
      p_feedback: null as unknown as string,
    });
  });
});

test("database field errors are worded for the form", () => {
  const error = staffFieldMessage({ code: "invalid_input", field: "station", message: "Nilai station tidak valid." });
  expect(error.message).toBe("Pilih unit (stasiun) yang ada di daftar.");
  const other = { code: "out_of_scope" as const, message: "x" };
  expect(staffFieldMessage(other)).toBe(other);
});

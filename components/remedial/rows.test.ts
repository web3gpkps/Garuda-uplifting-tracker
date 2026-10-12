import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/rules";
import { filterRemedialRows, formatGain, remedialTone, parseRemedialFilter, remedialCounts, remedialRows, shortCause } from "./rows";

const s: Settings = { ...DEFAULT_SETTINGS, passGrade: 85, weightRolePlay: 0.4, weightPostTest: 0.6 };

const staff = [
  // Passed (final 90): not listed.
  { code: "IULS-01", name: "Dummy A", program: "IULS", station: "CGK", rolePlay: 90, postTest: 90, reportRemark: "Passed" },
  // Failed, absent role play (final 54): listed without a remedial row.
  { code: "IULS-02", name: "Dummy B", program: "IULS", station: "CGK", rolePlay: 0, postTest: 90, reportRemark: "Failed" },
  // Failed (final 80), remedial passed 90.
  { code: "RUST-01", name: "Dummy C", program: "RUST", station: "DPS", rolePlay: 80, postTest: 80, reportRemark: "Failed" },
  // Failed (final 82), scheduled, no result yet.
  { code: "RUST-02", name: "Dummy D", program: "RUST", station: "DPS", rolePlay: 70, postTest: 90, reportRemark: "Failed" },
  // No baseline, but a remedial row exists: listed, not counted as Failed.
  { code: "RUST-03", name: null, program: "RUST", station: "KNO", rolePlay: null, postTest: null, reportRemark: null },
];

const remedials = [
  { staffCode: "RUST-01", action: "Individual Coaching", remedialOn: "2026-10-20", rolePlay: 90, postTest: 90, reported: "Ya", notes: null },
  { staffCode: "RUST-02", action: "Refresher & Remedial Assessment", remedialOn: null, rolePlay: null, postTest: null, reported: null, notes: null },
  { staffCode: "RUST-03", action: null, remedialOn: null, rolePlay: 80, postTest: 80, reported: "Belum", notes: "Dummy" },
];

describe("remedialRows", () => {
  const rows = remedialRows(staff, remedials, s);

  test("every Failed participant plus anyone with a remedial row, in staff order", () => {
    expect(rows.map((r) => r.code)).toEqual(["IULS-02", "RUST-01", "RUST-02", "RUST-03"]);
  });

  test("derived result, status and gain", () => {
    const [b, c, d, e] = rows;
    expect(b.remedial).toBeNull();
    expect(b.status).toBe("Belum dijadwalkan");
    expect(b.failureCause).toBe("Kendala operasional & kehadiran (absen role play)");
    expect(c.baselineFinal).toBe(80);
    expect(c.finalResult).toBe(90);
    expect(c.status).toBe("Lulus");
    expect(c.gain).toBe(10);
    expect(d.status).toBe("Menunggu hasil");
    expect(d.gain).toBeNull();
    expect(e.failed).toBe(false);
    expect(e.status).toBe("Belum Lulus");
    expect(e.name).toBe("RUST-03");
  });

  test("summary counts", () => {
    expect(remedialCounts(rows)).toEqual({
      failed: 3,
      scheduled: 3,
      passed: 1,
      notPassed: 1,
      waiting: 1,
      absentRolePlay: 1,
      reported: 1,
    });
  });

  test("filters", () => {
    const f = parseRemedialFilter("rust", "Lulus", null, ["IULS", "RUST"]);
    expect(f).toEqual({ program: "RUST", status: "Lulus", station: null });
    expect(filterRemedialRows(rows, f).map((r) => r.code)).toEqual(["RUST-01"]);
    expect(filterRemedialRows(rows, { program: null, status: null, station: "CGK" }).map((r) => r.code)).toEqual([
      "IULS-02",
    ]);
  });

  test("unknown filter values are ignored", () => {
    expect(parseRemedialFilter("XYZ", "Apa saja", null, ["IULS", "RUST"])).toEqual({
      program: null,
      status: null,
      station: null,
    });
  });
});

test("shortCause", () => {
  expect(shortCause("Kendala operasional & kehadiran (absen role play)")).toBe("Absen role play");
  expect(shortCause(null)).toBeNull();
});

test("display helpers", () => {
  expect(formatGain(10)).toBe("+10");
  expect(formatGain(-2.5)).toBe("-2,5");
  expect(formatGain(null)).toBe("");
  expect(remedialTone("Lulus")).toBe("good");
  expect(remedialTone("Belum Lulus")).toBe("critical");
  expect(remedialTone("Belum dijadwalkan")).toBe("neutral");
});

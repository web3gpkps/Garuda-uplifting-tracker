import { describe, expect, test } from "bun:test";
import {
  addBmiStaff,
  checkAddBmiStaff,
  checkBmiStaffProfile,
  OTHER_TOUCH_POINT,
  resolveStation,
  resolveTouchPoint,
  TOUCH_POINT_MAX,
  type AddBmiStaffInput,
  type AddBmiStaffPorts,
} from "./add-staff";
import type { StaffInput } from "@/components/sdm/staff-input";
import { WorkbookWorld } from "@/lib/sync/testing/workbook";
import { smallDb, staffRow, bmiRow } from "@/lib/sync/testing/fixtures";
import { bmiSummary, DEFAULT_SETTINGS, TOUCH_POINTS } from "@/lib/rules";

const input: AddBmiStaffInput = {
  name: "Petugas uji", employeeNo: "EMP-1001", gender: "P", bmiHasNote: true, bmiNote: "Latihan uji",
  firstCheck: { period: 3, checkDate: "2026-11-09", heightCm: 165.5, weightKg: 65.5 }, savedCode: null,
};
const denied = { ok: false as const, error: { code: "unknown" as const, message: "Tidak bisa disimpan." } };
const STATIONS = ["CGK", "DPS", "SUB"];
// The number of checks in these fixtures; the code reads it from Parameter.
const PERIODS = 6;

type Kind = "owner" | "link" | "account";

/** `scope` is the verified scope of the access; KPS and owner see every station. */
function harness(scope = "CGK", kind: Kind = "link") {
  const calls: string[] = [];
  const rows: Array<{ code: string; name: string; employeeNo: string | null; station: string }> = [];
  const saved: Array<{ station: string | null; program: string | null; touchPoint: string | null }> = [];
  const ports: AddBmiStaffPorts = {
    load: async () => ({
      kind, scope, isKps: scope === "KPS" || kind === "owner", isOwner: kind === "owner",
      stations: STATIONS, periods: PERIODS, staff: rows,
    }),
    saveStaff: async (profile) => {
      calls.push("staff");
      expect(profile.code).toBeNull();
      expect(profile.employeeNo).toBe(input.employeeNo);
      const code = `TMB-${rows.length + 10}`;
      saved.push({ station: profile.station, program: profile.program, touchPoint: profile.touchPoint });
      rows.push({ code, name: profile.name, employeeNo: profile.employeeNo, station: profile.station ?? "" });
      return { ok: true, code, name: profile.name, savedAt: "2026-10-14T00:00:00Z" };
    },
    saveProfile: async () => { calls.push("profile"); return { ok: true, deleted: false, savedAt: "2026-10-14T00:00:00Z" }; },
    saveCheck: async (check) => { calls.push("check"); expect(check.period).toBe(3); return { ok: true, deleted: false, savedAt: "2026-10-14T00:00:00Z" }; },
  };
  return { calls, rows, saved, ports };
}

describe("add staff to a single-station access", () => {
  test("valid input creates a staff member, profile and optional first check", async () => {
    const h = harness();
    expect(await addBmiStaff(input, h.ports)).toEqual({ ok: true, code: "TMB-10" });
    expect(h.calls).toEqual(["staff", "profile", "check"]);
    expect(h.saved).toEqual([{ station: "CGK", program: null, touchPoint: null }]);
  });
  test("the first check may be omitted", async () => {
    const h = harness();
    expect((await addBmiStaff({ ...input, firstCheck: null }, h.ports)).ok).toBe(true);
    expect(h.calls).toEqual(["staff", "profile"]);
  });
  test("a link or a branch account of any station adds to its own station", async () => {
    for (const [scope, kind] of [["CGK", "link"], ["DPS", "link"], ["SUB", "account"]] as const) {
      const h = harness(scope, kind);
      expect((await addBmiStaff(input, h.ports)).ok).toBe(true);
      expect(h.saved).toEqual([{ station: scope, program: null, touchPoint: null }]);
    }
  });
  test("a client-supplied station is ignored; the server always submits the verified one", async () => {
    for (const kind of ["link", "account"] as const) {
      const h = harness("CGK", kind);
      expect((await addBmiStaff({ ...input, station: "DPS" }, h.ports)).ok).toBe(true);
      expect(h.saved[0].station).toBe("CGK");
      expect(h.rows[0].station).toBe("CGK");
    }
  });
  test("Program is not used on this screen: it is never sent", async () => {
    const h = harness();
    expect((await addBmiStaff({ ...input, touchPoint: { choice: "Boarding Gate", other: "" } }, h.ports)).ok).toBe(true);
    expect(h.saved[0].program).toBeNull();
  });
  test("an unverifiable access cannot add anything", async () => {
    const h = harness(); h.ports.load = async () => null;
    expect((await addBmiStaff(input, h.ports)).ok).toBe(false);
    expect(h.calls).toEqual([]);
  });
});

describe("add staff to a KPS or owner access", () => {
  const cases = [["KPS", "link"], ["KPS", "owner"]] as const;

  test("must pick one of the workspace stations", async () => {
    for (const [scope, kind] of cases) {
      const h = harness(scope, kind);
      const result = await addBmiStaff({ ...input, station: "DPS" }, h.ports);
      expect(result).toEqual({ ok: true, code: "TMB-10" });
      expect(h.saved).toEqual([{ station: "DPS", program: null, touchPoint: null }]);
    }
  });
  test("no station, a blank station or an unknown station is refused before anything is written", async () => {
    for (const [scope, kind] of cases) {
      for (const station of [undefined, null, "", "  ", "ZZZ", "dps"]) {
        const h = harness(scope, kind);
        const result = await addBmiStaff({ ...input, station }, h.ports);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.field).toBe("station");
        expect(h.calls).toEqual([]);
      }
    }
  });
  test("resolveStation: single station scopes ignore the request, KPS and owner validate it", () => {
    const single = { scope: "SUB", isKps: false, isOwner: false, stations: STATIONS };
    expect(resolveStation(single, "CGK")).toEqual({ ok: true, station: "SUB" });
    expect(resolveStation(single, undefined)).toEqual({ ok: true, station: "SUB" });
    const kps = { scope: "KPS", isKps: true, isOwner: false, stations: STATIONS };
    expect(resolveStation(kps, " CGK ")).toEqual({ ok: true, station: "CGK" });
    expect(resolveStation(kps, "KPS").ok).toBe(false);
    expect(resolveStation({ ...kps, isOwner: true }, "ZZZ").ok).toBe(false);
  });
});

describe("touch point", () => {
  const other = (text: string) => ({ choice: OTHER_TOUCH_POINT, other: text });

  test("each standard value is saved as it is", async () => {
    for (const value of TOUCH_POINTS) {
      const h = harness();
      expect((await addBmiStaff({ ...input, touchPoint: { choice: value, other: "" } }, h.ports)).ok).toBe(true);
      expect(h.saved[0].touchPoint).toBe(value);
    }
  });
  test("leaving it unselected is allowed and saves nothing", async () => {
    for (const touchPoint of [undefined, null, { choice: "", other: "" }, { choice: "", other: "teks yang tertinggal" }]) {
      const h = harness();
      expect((await addBmiStaff({ ...input, touchPoint }, h.ports)).ok).toBe(true);
      expect(h.saved[0].touchPoint).toBeNull();
    }
  });
  test("Other saves the text typed, trimmed, and never the word Other", async () => {
    const h = harness();
    expect((await addBmiStaff({ ...input, touchPoint: other("  Lounge Utama  ") }, h.ports)).ok).toBe(true);
    expect(h.saved[0].touchPoint).toBe("Lounge Utama");
    expect(h.saved[0].touchPoint).not.toBe(OTHER_TOUCH_POINT);
  });
  test("a standard value ignores any text left in the Other field", async () => {
    const h = harness();
    expect((await addBmiStaff({ ...input, touchPoint: { choice: "Transfer Desk", other: "sisa ketikan" } }, h.ports)).ok).toBe(true);
    expect(h.saved[0].touchPoint).toBe("Transfer Desk");
  });
  test("Other without text is refused, whatever blank it is", async () => {
    for (const text of ["", "   ", "\t\n"]) {
      const h = harness();
      const result = await addBmiStaff({ ...input, touchPoint: other(text) }, h.ports);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.field).toBe("touch_point_other");
      expect(h.calls).toEqual([]);
    }
  });
  test("60 characters fit, 61 do not (counted after trimming)", async () => {
    expect(resolveTouchPoint(other("x".repeat(TOUCH_POINT_MAX)))).toEqual({ ok: true, value: "x".repeat(TOUCH_POINT_MAX) });
    expect(resolveTouchPoint(other(` ${"x".repeat(TOUCH_POINT_MAX)} `))).toEqual({ ok: true, value: "x".repeat(TOUCH_POINT_MAX) });
    const h = harness();
    const result = await addBmiStaff({ ...input, touchPoint: other("x".repeat(TOUCH_POINT_MAX + 1)) }, h.ports);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("touch_point_other");
      expect(result.error.message).toBe("Touch point paling panjang 60 karakter.");
    }
    expect(h.calls).toEqual([]);
  });
  test("the word Other typed as the text, and line breaks, are refused", () => {
    expect(resolveTouchPoint(other("other")).ok).toBe(false);
    expect(resolveTouchPoint(other(" OTHER ")).ok).toBe(false);
    expect(resolveTouchPoint(other("Lounge\nUtama")).ok).toBe(false);
    expect(resolveTouchPoint(other("Other Lounge")).ok).toBe(true);
  });
  test("an option that is neither empty, standard nor Other is refused", () => {
    for (const choice of ["Lounge", "other", "OTHER", "check-in counter"]) {
      const result = resolveTouchPoint({ choice, other: "x" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.field).toBe("touch_point");
    }
    expect(resolveTouchPoint("Boarding Gate" as never).ok).toBe(false);
  });
  test("the server profile check takes free text up to 60 characters and still checks the rest", () => {
    const profile: StaffInput = {
      code: null, program: null, provider: null, station: "CGK", name: "Petugas uji", employeeNo: null, gender: "P",
      touchPoint: "Lounge Utama", assignmentStatus: "Aktif", notes: null, baseline: null,
    };
    expect(checkBmiStaffProfile(profile)).toBeNull();
    expect(checkBmiStaffProfile({ ...profile, touchPoint: null })).toBeNull();
    expect(checkBmiStaffProfile({ ...profile, touchPoint: "x".repeat(61) })?.field).toBe("touch_point");
    expect(checkBmiStaffProfile({ ...profile, touchPoint: "a\nb" })?.field).toBe("touch_point");
    expect(checkBmiStaffProfile({ ...profile, name: " " })?.field).toBe("name");
    expect(checkBmiStaffProfile({ ...profile, program: "XYZ" })?.field).toBe("program");
  });
});

describe("add staff validation and retries", () => {
  test("all inputs are validated before creating anything", async () => {
    const invalidInputs: AddBmiStaffInput[] = [
      { ...input, name: " " }, { ...input, name: "x".repeat(201) },
      { ...input, employeeNo: "x".repeat(51) },
      { ...input, bmiHasNote: null }, { ...input, bmiNote: "x".repeat(2001) },
      { ...input, firstCheck: { ...input.firstCheck!, period: 0 } },
      { ...input, firstCheck: { ...input.firstCheck!, period: 1 } },
      { ...input, firstCheck: { ...input.firstCheck!, period: PERIODS + 1 } },
      { ...input, firstCheck: { ...input.firstCheck!, checkDate: "2026-02-30" } },
      { ...input, firstCheck: { ...input.firstCheck!, heightCm: 119 } },
      { ...input, firstCheck: { ...input.firstCheck!, weightKg: NaN } },
      { ...input, firstCheck: { ...input.firstCheck!, weightKg: 201 } },
      { ...input, firstCheck: { ...input.firstCheck!, heightCm: 165.55 } },
    ];
    for (const bad of invalidInputs) {
      const h = harness();
      expect(checkAddBmiStaff(bad, PERIODS)).not.toBeNull();
      expect((await addBmiStaff(bad, h.ports)).ok).toBe(false);
      expect(h.calls).toEqual([]);
    }
  });
  test("the last period follows Parameter", () => {
    const seventh = { ...input, firstCheck: { ...input.firstCheck!, period: 7 } };
    expect(checkAddBmiStaff(seventh, 6)).not.toBeNull();
    expect(checkAddBmiStaff(seventh, 8)).toBeNull();
  });
  test("the Coaching Assessment check (the first) is never added from here", () => {
    const first = { ...input, firstCheck: { ...input.firstCheck!, period: 1 } };
    const problem = checkAddBmiStaff(first, PERIODS);
    expect(problem?.field).toBe("period");
    expect(problem?.message).toBe("Data cek ini hanya bisa diubah di Google Sheet.");
  });
  test("2 to 52 periods: the first check may be the last one and not one beyond", () => {
    for (const periods of [2, 8, 26, 52]) {
      const last = { ...input, firstCheck: { ...input.firstCheck!, period: periods } };
      const beyond = { ...input, firstCheck: { ...input.firstCheck!, period: periods + 1 } };
      expect(checkAddBmiStaff(last, periods)).toBeNull();
      const problem = checkAddBmiStaff(beyond, periods);
      expect(problem?.field).toBe("period");
      expect(problem?.message).toBe(`Pilih BMI Cek ke-2 sampai BMI Cek ke-${periods}.`);
    }
  });
  test("a refused insert never reports success or writes BMI", async () => {
    const h = harness(); h.ports.saveStaff = async () => denied;
    expect(await addBmiStaff(input, h.ports)).toEqual(denied);
    expect(h.calls).toEqual([]);
  });
  test("partial failure retries the saved ID instead of inserting twice", async () => {
    const h = harness();
    const profile = h.ports.saveProfile; h.ports.saveProfile = async () => denied;
    const failed = await addBmiStaff(input, h.ports);
    expect(failed).toEqual({ ...denied, code: "TMB-10" });
    h.ports.saveProfile = profile;
    expect(await addBmiStaff({ ...input, savedCode: "TMB-10" }, h.ports)).toEqual({ ok: true, code: "TMB-10" });
    expect(h.rows).toHaveLength(1);
    expect(h.calls).toEqual(["staff", "profile", "check"]);
  });
  test("a KPS retry keeps to the station that was picked", async () => {
    const h = harness("KPS", "owner");
    const profile = h.ports.saveProfile; h.ports.saveProfile = async () => denied;
    expect((await addBmiStaff({ ...input, station: "SUB" }, h.ports)).ok).toBe(false);
    h.ports.saveProfile = profile;
    expect((await addBmiStaff({ ...input, station: "DPS", savedCode: "TMB-10" }, h.ports)).ok).toBe(false);
    expect(await addBmiStaff({ ...input, station: "SUB", savedCode: "TMB-10" }, h.ports)).toEqual({ ok: true, code: "TMB-10" });
    expect(h.rows).toHaveLength(1);
  });
  test("failed first check is reported as partial, not success", async () => {
    const h = harness(); h.ports.saveCheck = async () => denied;
    expect(await addBmiStaff(input, h.ports)).toEqual({ ...denied, code: "TMB-10" });
  });
  test("a retry cannot target a different station or another identity", async () => {
    const h = harness();
    h.rows.push({ code: "OTHER", name: input.name, employeeNo: input.employeeNo, station: "DPS" });
    expect((await addBmiStaff({ ...input, savedCode: "OTHER" }, h.ports)).ok).toBe(false);
    h.rows[0].station = "CGK"; h.rows[0].name = "Autre fixture";
    expect((await addBmiStaff({ ...input, savedCode: "OTHER" }, h.ports)).ok).toBe(false);
    expect(h.calls).toEqual([]);
  });
  test("ambiguous network failure does not invite another insert", async () => {
    const h = harness(); h.ports.saveStaff = async () => { throw new Error("network"); };
    const result = await addBmiStaff(input, h.ports);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.uncertain).toBe(true);
  });
  test("multiple additions use the existing generated IDs", async () => {
    const h = harness();
    const results = await Promise.all([addBmiStaff(input, h.ports), addBmiStaff(input, h.ports)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(h.rows.map((r) => r.code)).size).toBe(2);
  });
});

test("an addition syncs Master SDM to BMI without replacing formulas or existing staff", async () => {
  const w = new WorkbookWorld(smallDb());
  w.sync();
  const oldCode = String(w.book.get("Master SDM", "B5"));
  const formula = w.book.formula("Cek BMI 2 Mingguan", "M9");
  const h = harness();
  const saveStaff = h.ports.saveStaff;
  h.ports.saveStaff = async (profile) => {
    const result = await saveStaff(profile);
    if (result.ok) w.db.rows("staff").push(staffRow(result.code, 9, { station: "CGK", name: profile.name, employee_no: profile.employeeNo, program: null, touch_point: profile.touchPoint, gender: profile.gender }));
    return result;
  };
  h.ports.saveProfile = async (profile) => {
    const row = w.db.find("staff", { code: profile.staffCode })!;
    row.bmi_has_note = profile.bmiHasNote; row.bmi_note = profile.bmiNote;
    return { ok: true, deleted: false, savedAt: "2026-10-14T00:00:00Z" };
  };
  h.ports.saveCheck = async (check) => {
    w.db.rows("bmi_checks").push(bmiRow(90, check.staffCode, check.period, {
      check_date: check.checkDate, height_cm: check.heightCm, weight_kg: check.weightKg,
    }));
    return { ok: true, deleted: false, savedAt: "2026-10-14T00:00:00Z" };
  };
  const result = await addBmiStaff(input, h.ports);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  w.sync(); w.sync();
  const row = w.book.findRow("Master SDM", "B", result.code);
  expect(w.book.get("Master SDM", `F${row}`)).toBe(input.name);
  expect(w.book.get("Master SDM", `G${row}`)).toBe(input.employeeNo);
  expect(w.book.get("Cek BMI 2 Mingguan", `B${row + 1}`)).toBe(result.code);
  expect(w.book.get("Cek BMI 2 Mingguan", `I${row + 1}`)).toBe("Ya");
  expect(w.book.get("Cek BMI 2 Mingguan", `W${row + 1}`)).toBe(165.5);
  expect(w.book.get("Cek BMI 2 Mingguan", `X${row + 1}`)).toBe(65.5);
  expect(w.book.get("Master SDM", "B5")).toBe(oldCode);
  expect(w.book.formula("Cek BMI 2 Mingguan", "M9")).toBe(formula);
  const summary = bmiSummary([{ staffCode: result.code, period: 3, checkDate: "2026-11-09", heightCm: 165.5, weightKg: 65.5 }], DEFAULT_SETTINGS, "2026-11-09");
  expect(summary.checks).toBe(1);
  expect(summary.nextCheck).toBe("2026-11-23");
});

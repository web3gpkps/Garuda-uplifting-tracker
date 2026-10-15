import { describe, expect, test } from "bun:test";
import type { StaffInput } from "@/components/sdm/staff-input";
import { OTHER_TOUCH_POINT } from "./add-staff";
import { checkEditBmiStaff, editBmiStaff, type EditableStaff, type EditBmiStaffInput, type EditBmiStaffPorts } from "./edit-staff";

const stored: EditableStaff = {
  code: "TMB-01", program: "IULS", provider: "Penyedia", station: "CGK", name: "Ega Boediarta", employeeNo: "180501217887",
  gender: "L", touchPoint: "Boarding Gate", assignmentStatus: "Remedial", notes: "Penilaian Coaching",
};
const input: EditBmiStaffInput = {
  code: "TMB-01", name: "  Ega Budiarta ", employeeNo: " 180501217888 ", touchPoint: { choice: "Check-in Counter", other: "" }, gender: "P",
};

function harness(staff: EditableStaff[] | null = [stored]) {
  const sent: StaffInput[] = [];
  const ports: EditBmiStaffPorts = {
    load: async () => staff,
    saveStaff: async (profile) => {
      sent.push(profile);
      return { ok: true, code: profile.code ?? "", name: profile.name, savedAt: "2026-10-15T00:00:00Z" };
    },
  };
  return { sent, ports };
}

describe("editing a profile from Cek BMI", () => {
  test("changes the four fields and sends everything else back as stored", async () => {
    const h = harness();
    expect(await editBmiStaff(input, h.ports)).toEqual({
      ok: true, name: "Ega Budiarta", employeeNo: "180501217888", touchPoint: "Check-in Counter", gender: "P",
    });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toEqual({
      code: "TMB-01", program: "IULS", provider: "Penyedia", station: "CGK",
      name: "Ega Budiarta", employeeNo: "180501217888", gender: "P", touchPoint: "Check-in Counter",
      assignmentStatus: "Remedial", notes: "Penilaian Coaching", baseline: null,
    });
  });

  test("an emptied employee number and L/P are saved as empty", async () => {
    const h = harness();
    const result = await editBmiStaff({ ...input, employeeNo: "  ", gender: null, touchPoint: { choice: "", other: "" } }, h.ports);
    expect(result).toMatchObject({ ok: true, employeeNo: null, gender: null, touchPoint: null });
    expect(h.sent[0]).toMatchObject({ employeeNo: null, gender: null, touchPoint: null });
  });

  test("Other saves the typed text, never the word Other", async () => {
    const h = harness();
    const result = await editBmiStaff({ ...input, touchPoint: { choice: OTHER_TOUCH_POINT, other: " Lounge Utama " } }, h.ports);
    expect(result).toMatchObject({ ok: true, touchPoint: "Lounge Utama" });
    expect(h.sent[0].touchPoint).toBe("Lounge Utama");
  });

  test("a person the access cannot see is refused before any save", async () => {
    const h = harness([{ ...stored, code: "TMB-02" }]);
    const result = await editBmiStaff(input, h.ports);
    expect(result).toMatchObject({ ok: false, error: { code: "out_of_scope" } });
    expect(h.sent).toEqual([]);
  });

  test("an access that cannot be checked is refused", async () => {
    const h = harness(null);
    expect(await editBmiStaff(input, h.ports)).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(h.sent).toEqual([]);
  });

  test("a refused or lost save is reported, never shown as saved", async () => {
    const h = harness();
    h.ports.saveStaff = async () => ({ ok: false, error: { code: "out_of_scope", message: "Di luar cakupan." } });
    expect(await editBmiStaff(input, h.ports)).toEqual({ ok: false, error: { code: "out_of_scope", message: "Di luar cakupan." } });
    h.ports.saveStaff = async () => {
      throw new Error("offline");
    };
    expect(await editBmiStaff(input, h.ports)).toMatchObject({ ok: false, error: { code: "unknown" } });
  });
});

describe("checkEditBmiStaff", () => {
  test("fine input passes", () => {
    expect(checkEditBmiStaff(input)).toBeNull();
  });
  test("each bad field is named", () => {
    const bad: Array<[Partial<EditBmiStaffInput>, string]> = [
      [{ name: "   " }, "name"],
      [{ name: "x".repeat(201) }, "name"],
      [{ employeeNo: "x".repeat(51) }, "employee_no"],
      [{ gender: "X" as "L" }, "gender"],
      [{ touchPoint: { choice: OTHER_TOUCH_POINT, other: " " } }, "touch_point_other"],
      [{ touchPoint: { choice: "Bukan daftar", other: "" } }, "touch_point"],
      [{ code: " " }, "staff_code"],
    ];
    for (const [patch, field] of bad) expect(checkEditBmiStaff({ ...input, ...patch })?.field).toBe(field);
  });
});

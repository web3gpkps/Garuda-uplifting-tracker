"use server";

import { refresh } from "next/cache";
import { profileArgs, staffFieldMessage, type StaffInput } from "@/components/sdm/staff-input";
import type { StaffSaveResult } from "@/components/sdm/actions";
import { getWorkspaceFor, resolveAccess, ruleSettings, stationCodes, toLinkError } from "@/lib/workspace";
import { saveBmiCheck, saveBmiProfile } from "./actions";
import { addBmiStaff, checkBmiStaffProfile, type AddBmiStaffInput, type AddBmiStaffResult } from "./add-staff";
import { editBmiStaff, type EditBmiStaffInput, type EditBmiStaffResult } from "./edit-staff";

/**
 * Adds the staff row (share_save_staff) for "Tambah SDM". It is the Master SDM save without the
 * list check on Touch Point: the screen lets the owner type a touch point of up to 60 characters
 * and the database accepts it. Program is not sent. Access and station scope are decided by the
 * database from the token, as for every other save.
 */
async function saveStaffProfile(accessKey: string, input: StaffInput): Promise<StaffSaveResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const problem = checkBmiStaffProfile(input);
  if (problem) return { ok: false, error: problem };
  const { data, error } = await resolved.rpc("share_save_staff", profileArgs(input));
  if (error) return { ok: false, error: staffFieldMessage(toLinkError(error)) };
  const row = ((data ?? {}) as { row?: { code?: string; name?: string; updated_at?: string } }).row ?? {};
  refresh();
  return {
    ok: true,
    code: row.code ?? "",
    name: row.name ?? input.name.trim(),
    savedAt: row.updated_at ?? new Date().toISOString(),
  };
}

/**
 * "Tambah SDM" on Cek BMI. The station comes from the verified access (a link or branch
 * account sees only its own station); an owner or KPS access must pick one of its stations,
 * which is checked here against the workspace. Never trusts a station from the form otherwise.
 */
export async function addStaffFromBmi(accessKey: string, input: AddBmiStaffInput): Promise<AddBmiStaffResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  return addBmiStaff(input, {
    load: async () => {
      const result = await getWorkspaceFor(resolved.access);
      if (!result.ok) return null;
      const ws = result.workspace;
      return {
        kind: resolved.access.kind,
        scope: ws.scope,
        isKps: ws.isKps,
        isOwner: ws.isOwner,
        stations: stationCodes(ws),
        periods: ruleSettings(ws.settings).bmiPeriods,
        staff: ws.staff,
      };
    },
    saveStaff: (profile) => saveStaffProfile(accessKey, profile),
    saveProfile: (profile) => saveBmiProfile(accessKey, profile),
    saveCheck: (check) => saveBmiCheck(accessKey, check),
  });
}

/**
 * "Ubah profil" on a name in Cek BMI: corrects the name, the employee number, the touch point and
 * L/P. The staff list comes from the verified access, so a person outside its scope is never found;
 * the database checks the scope again.
 */
export async function editStaffFromBmi(accessKey: string, input: EditBmiStaffInput): Promise<EditBmiStaffResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  return editBmiStaff(input, {
    load: async () => {
      const result = await getWorkspaceFor(resolved.access);
      if (!result.ok) return null;
      return result.workspace.staff.map((st) => ({
        code: st.code,
        program: st.program ?? null,
        provider: st.provider ?? null,
        station: st.station ?? null,
        name: st.name ?? null,
        employeeNo: st.employeeNo ?? null,
        gender: st.gender ?? null,
        touchPoint: st.touchPoint ?? null,
        assignmentStatus: st.assignmentStatus ?? null,
        notes: st.notes ?? null,
      }));
    },
    saveStaff: (profile) => saveStaffProfile(accessKey, profile),
  });
}

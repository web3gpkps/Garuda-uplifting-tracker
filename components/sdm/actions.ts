"use server";

import { refresh } from "next/cache";
import { resolveAccess, toLinkError, type LinkError } from "@/lib/workspace";
import { deleteStaffAs, type DeleteStaffResult, type StaffDeleteClient } from "./delete-staff";
import {
  baselineArgs,
  checkBaseline,
  checkProfile,
  profileArgs,
  staffFieldMessage,
  type StaffInput,
} from "./staff-input";

export type StaffSaveResult =
  | { ok: true; code: string; name: string; savedAt: string }
  /** `saved` is true when the profile was saved but the baseline step failed. */
  | { ok: false; error: LinkError; saved?: boolean; code?: string };

/**
 * Adds or edits one staff member (share_save_staff) and, for KPS links and the owner, the
 * training baseline (share_kps_save_staff_baseline). accessKey is access.key (a link token,
 * or "owner"). The database enforces the rest: a station link's new staff go to its own
 * station, editing staff outside the scope fails with out_of_scope, and the baseline
 * function rejects station links with forbidden_field.
 */
export async function saveStaff(accessKey: string, input: StaffInput): Promise<StaffSaveResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if (!input || typeof input !== "object") {
    return { ok: false, error: { code: "invalid_input", message: "Isian tidak lengkap. Muat ulang halaman." } };
  }
  const problem = checkProfile(input) ?? (input.baseline ? checkBaseline(input.baseline) : null);
  if (problem) return { ok: false, error: problem };

  const { data, error } = await resolved.rpc("share_save_staff", profileArgs(input));
  if (error) return { ok: false, error: staffFieldMessage(toLinkError(error)) };
  const row = ((data ?? {}) as { row?: { code?: string; name?: string; updated_at?: string } }).row ?? {};
  const code = row.code ?? input.code ?? "";
  const name = row.name ?? input.name.trim();
  let savedAt = row.updated_at ?? new Date().toISOString();

  if (input.baseline && code) {
    const res = await resolved.rpc("share_kps_save_staff_baseline", baselineArgs(code, input.baseline));
    if (res.error) {
      refresh();
      return { ok: false, error: toLinkError(res.error), saved: true, code };
    }
    savedAt = ((res.data ?? {}) as { row?: { updated_at?: string } }).row?.updated_at ?? savedAt;
  }

  refresh();
  return { ok: true, code, name, savedAt };
}

/**
 * Owner-only "Hapus SDM". Guarded twice: resolveAccess("owner") requires an admin session,
 * and deleteStaffAs refuses anything but owner access. The delete runs with the owner's
 * cookie client under the admin RLS policy; weekly scores, BMI checks and remedials
 * cascade, and replacements keep their row with staff_code set to NULL.
 */
export async function deleteStaff(accessKey: string, code: string): Promise<DeleteStaffResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const result = await deleteStaffAs(
    resolved.access,
    resolved.ownerClient as unknown as StaffDeleteClient | null,
    code,
  );
  if (result.ok) refresh();
  return result;
}

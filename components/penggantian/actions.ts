"use server";

import { refresh } from "next/cache";
import { resolveAccess, toLinkError, type LinkError } from "@/lib/workspace";
import { checkReplacementInput, type ReplacementInput } from "@/components/penggantian/replacement-input";

export type ReplacementActionResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: LinkError };

/**
 * share_save_replacement: insert (id null) or update one replacement row. accessKey is
 * access.key (a link token, or "owner"); the station and scope are enforced in SQL.
 */
export async function saveReplacement(
  accessKey: string,
  input: ReplacementInput,
): Promise<ReplacementActionResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const problem = checkReplacementInput(input);
  if (problem) return { ok: false, error: problem };

  // Generated RPC types are non-nullable; NULL clears a field (docs/SPEC.md, RPC contract).
  const { error } = await resolved.rpc("share_save_replacement", {
    p_id: input.id as number,
    p_program: input.program as string,
    p_station: input.station as string,
    p_staff_code: input.staffCode as string,
    p_replaced_name: input.replacedName as string,
    p_reason: input.reason as string,
    p_withdrawn_on: input.withdrawnOn as string,
    p_replacement_name: input.replacementName as string,
    p_effective_on: input.effectiveOn as string,
    p_training_on: input.trainingOn as string,
    p_post_test: input.postTest as number,
    p_final_result: input.finalResult as number,
    p_reported: input.reported as string,
    p_notes: input.notes as string,
  });
  if (error) return { ok: false, error: toLinkError(error) };

  refresh();
  return { ok: true, savedAt: new Date().toISOString() };
}

/** share_delete_replacement. */
export async function deleteReplacement(accessKey: string, id: number): Promise<ReplacementActionResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if (!Number.isInteger(id)) {
    return {
      ok: false,
      error: { code: "invalid_input", field: "id", message: "Baris penggantian tidak dikenal. Muat ulang halaman lalu coba lagi." },
    };
  }

  const { error } = await resolved.rpc("share_delete_replacement", { p_id: id });
  if (error) return { ok: false, error: toLinkError(error) };

  refresh();
  return { ok: true, savedAt: new Date().toISOString() };
}

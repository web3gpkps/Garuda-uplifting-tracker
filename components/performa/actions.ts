"use server";

import { refresh } from "next/cache";
import { resolveAccess, toLinkError, type LinkError } from "@/lib/workspace";
import { checkWeeklyInput, weeklyArgs, type WeeklyScoreInput } from "./weekly-input";

export type WeeklyScoreResult =
  | { ok: true; deleted: boolean; savedAt: string }
  | { ok: false; error: LinkError };

/**
 * Upserts one staff member's Log Performa row for one week (share_save_weekly_score).
 * All fields empty deletes the row. accessKey is access.key (a link token, or "owner");
 * the function re-checks the token, the scope and the week range in SQL.
 */
export async function saveWeeklyScore(accessKey: string, input: WeeklyScoreInput): Promise<WeeklyScoreResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const problem = checkWeeklyInput(input);
  if (problem) return { ok: false, error: problem };

  const { data, error } = await resolved.rpc("share_save_weekly_score", weeklyArgs(input));
  if (error) {
    const linkError = toLinkError(error);
    if (linkError.field === "week") {
      return {
        ok: false,
        error: { ...linkError, message: "Minggu di luar jadwal program. Muat ulang halaman lalu coba lagi." },
      };
    }
    return { ok: false, error: linkError };
  }

  const result = (data ?? {}) as { deleted?: boolean; row?: { updated_at?: string } };
  refresh();
  return {
    ok: true,
    deleted: result.deleted === true,
    savedAt: result.row?.updated_at ?? new Date().toISOString(),
  };
}

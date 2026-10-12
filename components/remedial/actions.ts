"use server";

import { refresh } from "next/cache";
import { REMEDIAL_ACTIONS } from "@/lib/rules";
import { resolveAccess, toLinkError, type LinkError } from "@/lib/workspace";
import { isPlausibleDate } from "@/components/bmi/format";

export type RemedialActionResult =
  | { ok: true; deleted: boolean; savedAt: string }
  | { ok: false; error: LinkError };

export type RemedialInput = {
  staffCode: string;
  /** One of REMEDIAL_ACTIONS, or null. */
  action: string | null;
  /** 'YYYY-MM-DD' or null. */
  remedialOn: string | null;
  /** 0–100. */
  rolePlay: number | null;
  /** 0–100. */
  postTest: number | null;
  reported: "Ya" | "Belum" | null;
  notes: string | null;
};

function invalid(field: string, message: string): RemedialActionResult {
  return { ok: false, error: { code: "invalid_input", field, message } };
}

function scoreOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);
}

/**
 * share_save_remedial: upsert one staff member's remedial row (every field is written);
 * all fields empty deletes it. accessKey is access.key (a link token, or "owner"); the
 * scope (own station, KPS all) and the ranges are checked in SQL.
 */
export async function saveRemedial(accessKey: string, input: RemedialInput): Promise<RemedialActionResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  if (!input || typeof input.staffCode !== "string" || input.staffCode === "") {
    return invalid("staff_code", "Data remedial tidak lengkap. Muat ulang halaman lalu coba lagi.");
  }
  if (input.action !== null && !(REMEDIAL_ACTIONS as readonly string[]).includes(input.action)) {
    return invalid("action", "Pilih tindakan remedial dari daftar.");
  }
  if (input.remedialOn !== null && (typeof input.remedialOn !== "string" || !isPlausibleDate(input.remedialOn))) {
    return invalid("remedial_on", "Tanggal remedial tidak valid.");
  }
  if (!scoreOrNull(input.rolePlay)) return invalid("role_play", "Role play ulang harus 0 sampai 100.");
  if (!scoreOrNull(input.postTest)) return invalid("post_test", "Post-test ulang harus 0 sampai 100.");
  if (input.reported !== null && input.reported !== "Ya" && input.reported !== "Belum") {
    return invalid("reported", "Pilih Ya, Belum, atau kosongkan.");
  }
  if (input.notes !== null && typeof input.notes !== "string") return invalid("notes", "Catatan tidak valid.");

  const { error } = await resolved.rpc("share_save_remedial", {
    p_staff_code: input.staffCode,
    p_action: input.action as string,
    p_remedial_on: input.remedialOn as string,
    p_role_play: input.rolePlay as number,
    p_post_test: input.postTest as number,
    p_reported: input.reported as string,
    p_notes: input.notes as string,
  });
  if (error) return { ok: false, error: toLinkError(error) };

  refresh();
  const deleted =
    input.action === null &&
    input.remedialOn === null &&
    input.rolePlay === null &&
    input.postTest === null &&
    input.reported === null &&
    (input.notes === null || input.notes.trim() === "");
  return { ok: true, deleted, savedAt: new Date().toISOString() };
}

/** share_delete_remedial: removes the remedial row (the staff member stays on the list while Failed). */
export async function deleteRemedial(accessKey: string, staffCode: string): Promise<RemedialActionResult> {
  const resolved = await resolveAccess(accessKey);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if (typeof staffCode !== "string" || staffCode === "") {
    return invalid("staff_code", "SDM tidak dikenal. Muat ulang halaman lalu coba lagi.");
  }

  const { error } = await resolved.rpc("share_delete_remedial", { p_staff_code: staffCode });
  if (error) return { ok: false, error: toLinkError(error) };

  refresh();
  return { ok: true, deleted: true, savedAt: new Date().toISOString() };
}

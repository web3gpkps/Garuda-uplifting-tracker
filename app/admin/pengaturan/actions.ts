"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { validateSettings, type SettingsErrors, type SettingsValues } from "@/components/admin/settings-schema";

export type SaveSettingsResult =
  | { ok: true; savedAt: string }
  | { ok: false; message: string; errors?: SettingsErrors };

/** Saves the Parameter row (settings, id = 1). The database re-checks every CHECK constraint. */
export async function saveSettings(values: SettingsValues): Promise<SaveSettingsResult> {
  await requireAdmin();
  const { errors, update } = validateSettings(values);
  if (!update) return { ok: false, message: "Periksa isian yang ditandai.", errors };

  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").update(update).eq("id", 1).select("updated_at").maybeSingle();
  if (error) {
    return { ok: false, message: "Parameter belum tersimpan. Periksa isian, lalu coba lagi." };
  }
  if (!data) {
    return { ok: false, message: "Parameter tidak bisa diubah dengan akun ini." };
  }
  refresh();
  return { ok: true, savedAt: data.updated_at };
}

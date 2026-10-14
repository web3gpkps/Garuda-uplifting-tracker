"use server";

import { requestOrigin } from "@/lib/request-origin";
import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { KPS_SCOPE, isScopeFormat, type LinkActionResult } from "./link-types";
import { linkAccess } from "@/lib/workspace/access";

const MAX_LABEL = 80;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanLabel(raw: string): string | null {
  const text = raw.trim().replace(/\s+/g, " ");
  return text === "" ? null : text;
}

async function insertLink(scope: string, label: string | null) {
  const supabase = await createClient();
  // token, id, created_at and created_by (auth.uid()) are filled by the database.
  return supabase.from("share_links").insert({ scope, label }).select("token").single();
}

/**
 * True when the scope is KPS or a listed station. The database enforces the same rule with a
 * trigger; checking first turns a refusal into a message on the Lingkup field.
 */
async function scopeExists(scope: string): Promise<boolean | "unknown"> {
  if (scope === KPS_SCOPE) return true;
  const supabase = await createClient();
  const { data, error } = await supabase.from("stations").select("code").eq("code", scope).maybeSingle();
  if (error) return "unknown";
  return data !== null;
}

/** "Buat tautan": new link for a scope; returns the full URL to show once. */
export async function createShareLink(rawScope: string, rawLabel: string): Promise<LinkActionResult> {
  await requireAdmin();
  const scope = rawScope.trim().toUpperCase();
  const label = cleanLabel(rawLabel);
  const fieldErrors: { scope?: string; label?: string } = {};
  if (!isScopeFormat(scope)) fieldErrors.scope = "Pilih lingkup tautan.";
  else if ((await scopeExists(scope)) === false) fieldErrors.scope = `Stasiun ${scope} tidak ada di daftar stasiun.`;
  if (!label) fieldErrors.label = "Isi label, misalnya nama pemegang tautan.";
  else if (label.length > MAX_LABEL) fieldErrors.label = `Maksimal ${MAX_LABEL} karakter.`;
  if (fieldErrors.scope || fieldErrors.label) {
    return { ok: false, message: "Periksa isian yang ditandai.", fieldErrors };
  }

  const { data, error } = await insertLink(scope, label);
  if (error?.message === "share_links_scope_check") {
    return { ok: false, message: "Periksa isian yang ditandai.", fieldErrors: { scope: `Stasiun ${scope} tidak ada di daftar stasiun.` } };
  }
  if (error || !data) {
    return { ok: false, message: "Tautan belum dibuat. Coba lagi." };
  }
  const url = `${await requestOrigin()}${linkAccess(data.token).basePath}`;
  refresh();
  return { ok: true, link: { scope, label, url }, message: `Tautan ${scope} dibuat.` };
}

/** "Cabut tautan": sets revoked_at. The holder loses access on the next request. */
export async function revokeShareLink(id: string): Promise<LinkActionResult> {
  await requireAdmin();
  if (!UUID.test(id)) return { ok: false, message: "Tautan tidak dikenali." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("scope")
    .maybeSingle();
  if (error) return { ok: false, message: "Tautan belum dicabut. Coba lagi." };
  if (!data) return { ok: false, message: "Tautan ini sudah dicabut sebelumnya atau tidak ada lagi." };
  refresh();
  return { ok: true, message: `Tautan ${data.scope} dicabut.` };
}

/**
 * "Ganti tautan": a new link with the same scope and label, then the old one is revoked.
 * Creating first means a failed revoke never leaves the station without a working link.
 */
export async function rotateShareLink(id: string): Promise<LinkActionResult> {
  await requireAdmin();
  if (!UUID.test(id)) return { ok: false, message: "Tautan tidak dikenali." };
  const supabase = await createClient();
  const { data: old, error: readError } = await supabase
    .from("share_links")
    .select("scope, label, revoked_at")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { ok: false, message: "Tautan lama tidak terbaca. Coba lagi." };
  if (!old || old.revoked_at) return { ok: false, message: "Tautan ini sudah dicabut, jadi tidak bisa diganti." };

  const { data: created, error: createError } = await insertLink(old.scope, old.label);
  if (createError || !created) {
    return {
      ok: false,
      message: "Tautan baru belum dibuat. Tautan lama tetap aktif.",
    };
  }
  const link = { scope: old.scope, label: old.label, url: `${await requestOrigin()}${linkAccess(created.token).basePath}` };

  const { error: revokeError } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);
  refresh();
  if (revokeError) {
    return {
      ok: true,
      link,
      message: "Tautan baru dibuat, tetapi tautan lama belum tercabut. Cabut tautan lama dari tabel.",
    };
  }
  return { ok: true, link, message: `Tautan ${old.scope} diganti. Tautan lama tidak berlaku lagi.` };
}

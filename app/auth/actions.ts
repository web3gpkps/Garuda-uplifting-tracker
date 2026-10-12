"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export type SignInState =
  | { status: "idle" }
  | {
      status: "error";
      code:
        | "missing-fields"
        | "invalid-credentials"
        | "email-not-confirmed"
        | "rate-limited"
        | "auth-unreachable"
        | "not-configured"
        | "unknown";
      message: string;
      /** Field-level errors, keyed by input name. */
      fields?: { email?: string; password?: string };
      /** Echo the email back so the form keeps it after a failed attempt. */
      email?: string;
    };

/** Only paths inside the owner area; anything else (other sites, /login, /s/...) lands on /admin. */
function safeNext(raw: FormDataEntryValue | null): string {
  const next = typeof raw === "string" ? raw : "";
  if (next === "/admin" || next.startsWith("/admin/") || next.startsWith("/admin?")) return next;
  return "/admin";
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const fields: { email?: string; password?: string } = {};
  if (!email) fields.email = "Isi email akun Anda.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fields.email = "Format email belum benar.";
  }
  if (!password) fields.password = "Isi kata sandi.";
  if (fields.email || fields.password) {
    return {
      status: "error",
      code: "missing-fields",
      message: "Lengkapi isian yang ditandai.",
      fields,
      email,
    };
  }

  if (!getSupabasePublicEnv()) {
    return {
      status: "error",
      code: "not-configured",
      message: "Tidak bisa masuk. Hubungi pengelola aplikasi.",
      email,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "invalid_credentials" || (error.status === 400 && !error.code)) {
      return {
        status: "error",
        code: "invalid-credentials",
        message: "Email atau kata sandi salah.",
        email,
      };
    }
    if (error.code === "email_not_confirmed") {
      return {
        status: "error",
        code: "email-not-confirmed",
        message: "Akun belum dikonfirmasi. Hubungi pengelola aplikasi.",
        email,
      };
    }
    if (error.code === "over_request_rate_limit" || error.status === 429) {
      return {
        status: "error",
        code: "rate-limited",
        message: "Terlalu banyak percobaan. Tunggu beberapa menit, lalu coba lagi.",
        email,
      };
    }
    if (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500) {
      return {
        status: "error",
        code: "auth-unreachable",
        message: "Tidak bisa masuk. Coba lagi.",
        email,
      };
    }
    return {
      status: "error",
      code: "unknown",
      message: "Tidak bisa masuk. Coba lagi.",
      email,
    };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signOut(): Promise<void> {
  if (getSupabasePublicEnv()) {
    const supabase = await createClient();
    // scope "local": end this browser's session only, not the admin's other devices.
    await supabase.auth.signOut({ scope: "local" });
  }
  revalidatePath("/", "layout");
  redirect("/login");
}

import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getAccountSession } from "@/lib/supabase/account";
import { getAdminSession } from "@/lib/supabase/auth";
import { AuthFrame } from "@/components/shell/AuthFrame";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Ganti kata sandi" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthFrame title="Ganti kata sandi" />}>
      <ResetGate />
    </Suspense>
  );
}

/** Changing the password needs a session: a signed-in account, or one the recovery link (/auth/callback) opened. */
async function ResetGate() {
  const [admin, account] = await Promise.all([getAdminSession(), getAccountSession()]);
  const signedIn = admin.status === "admin" || admin.status === "not-admin" || account.status !== "signed-out";

  if (!signedIn) {
    return (
      <AuthFrame
        title="Masuk dulu"
        intro={<p>Masuk dengan kata sandi Anda (atau kata sandi sementara dari pengelola), lalu ganti kata sandi di sini.</p>}
        footnote={
          <Link href="/login" className="font-semibold text-accent underline underline-offset-2">
            Ke halaman masuk
          </Link>
        }
      />
    );
  }

  return (
    <AuthFrame title="Ganti kata sandi" intro="Pilih kata sandi baru untuk akun Anda.">
      <ResetPasswordForm />
    </AuthFrame>
  );
}

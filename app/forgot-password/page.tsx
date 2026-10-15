import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/shell/AuthFrame";

export const metadata: Metadata = { title: "Lupa kata sandi" };

/**
 * No e-mail goes out (the project has no mail server): the owner resets the password in Akun Cabang and
 * hands over a temporary one, which the account then changes under Ganti kata sandi.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthFrame
      title="Lupa kata sandi"
      intro={
        <div className="flex flex-col gap-3">
          <p>Kata sandi akun cabang diatur ulang oleh pengelola aplikasi, tidak lewat email.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Hubungi pengelola aplikasi dan sebutkan nama serta email akun Anda.</li>
            <li>Pengelola memberi Anda kata sandi sementara.</li>
            <li>Masuk dengan kata sandi itu, lalu ganti lewat menu Ganti kata sandi.</li>
          </ol>
        </div>
      }
      footnote={
        <Link href="/login" className="font-semibold text-accent underline underline-offset-2">
          Kembali ke halaman masuk
        </Link>
      }
    />
  );
}

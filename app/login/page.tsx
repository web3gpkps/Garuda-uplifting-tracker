import type { Metadata } from "next";
import { AuthFrame } from "@/components/shell/AuthFrame";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <AuthFrame title="Masuk" footnote="Stasiun dan KPS tidak perlu masuk: buka tautan yang dibagikan kepada Anda.">
      <LoginForm />
    </AuthFrame>
  );
}

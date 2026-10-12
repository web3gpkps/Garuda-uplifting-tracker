import type { Metadata } from "next";
import { AuthFrame } from "@/components/shell/AuthFrame";
import { SHEETS } from "@/lib/workspace/access";
import { LoginForm } from "./LoginForm";

const SHEET_NAMES = SHEETS.map((sheet) => sheet.label).join(", ");

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <AuthFrame
      title="Masuk ke area pemilik"
      intro={
        <p>
          Area pemilik berisi workbook semua stasiun ({SHEET_NAMES}) serta tautan stasiun,
          Parameter, dan sinkronisasi Google Sheet.
        </p>
      }
      footnote={
        <p>
          Stasiun dan KPS tidak perlu masuk: buka tautan ruang kerja yang dibagikan pemilik
          aplikasi. Tautan hilang atau tidak bisa dibuka? Minta tautan baru kepada pemilik aplikasi.
        </p>
      }
    >
      <LoginForm />
    </AuthFrame>
  );
}

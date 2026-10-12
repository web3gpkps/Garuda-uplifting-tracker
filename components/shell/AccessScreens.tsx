import { ReloadButton } from "@/components/ui/ReloadButton";
import { AuthFrame } from "./AuthFrame";
import { SignOutButton } from "./SignOutButton";

/** Signed in, but the account is not in public.admins. */
export function NotAdminScreen({ email }: { email: string }) {
  return (
    <AuthFrame
      title="Akun ini belum terdaftar sebagai admin"
      intro={
        <p>
          Anda masuk sebagai <span className="font-semibold text-ink">{email || "akun tanpa email"}</span>. Minta
          pengelola aplikasi menambahkan akun ini, lalu masuk lagi.
        </p>
      }
    >
      <SignOutButton variant="primary" fullWidth>
        Keluar
      </SignOutButton>
    </AuthFrame>
  );
}

const UNAVAILABLE_COPY = {
  config: {
    title: "Aplikasi belum terhubung ke database",
    body: "Pengaturan koneksi aplikasi belum lengkap. Hubungi pengelola aplikasi.",
  },
  auth: {
    title: "Layanan login tidak bisa dihubungi",
    body: "Periksa koneksi, lalu muat ulang halaman.",
  },
  database: {
    title: "Akses admin tidak bisa diperiksa",
    body: "Muat ulang halaman. Jika masih gagal, hubungi pengelola aplikasi.",
  },
} as const;

/**
 * The admin check could not run: missing configuration, Auth or database unreachable.
 * Technical detail stays in the server log; the screen says what to do.
 */
export function GateUnavailableScreen({ reason }: { reason: keyof typeof UNAVAILABLE_COPY }) {
  const copy = UNAVAILABLE_COPY[reason];
  return (
    <AuthFrame title={copy.title} intro={<p>{copy.body}</p>}>
      <ReloadButton variant="primary" />
    </AuthFrame>
  );
}

/** /s/<token> with an unknown, malformed or revoked token. Stations have no login to fall back to. */
export function InvalidLinkScreen() {
  return (
    <AuthFrame
      title="Tautan tidak berlaku"
      intro={<p>Tautan ini tidak dikenali atau sudah dicabut. Minta tautan baru kepada pengelola aplikasi.</p>}
    />
  );
}

/** share_open failed for another reason (database unreachable, unexpected answer). */
export function WorkspaceUnavailableScreen() {
  return (
    <AuthFrame
      title="Halaman belum bisa dibuka"
      intro={<p>Data tidak bisa diambil saat ini. Tautan Anda tetap berlaku; muat ulang halaman.</p>}
    >
      <ReloadButton variant="primary" />
    </AuthFrame>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { ReloadButton } from "@/components/ui/ReloadButton";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { settingsToFormValues } from "@/components/admin/settings-schema";
import { formatWaktu } from "@/components/admin/format";
import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pengaturan" };

export default function PengaturanPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengaturan"
        description="Parameter program, sama dengan sheet Parameter di workbook: jadwal pemantauan, slot cek BMI, klasifikasi BMI, passing grade dan bobot Final Result, target KPI slide 15, serta batas penggantian SDM. Semua rumus di aplikasi membaca nilai ini."
      />
      <Suspense fallback={<LoadingState label="Memuat parameter" />}>
        <SettingsData />
      </Suspense>
    </div>
  );
}

async function SettingsData() {
  await requireAdmin();
  const supabase = await createClient();
  const settingsResult = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();

  if (settingsResult.error) {
    return (
      <Panel>
        <ErrorState
          title="Parameter tidak bisa dimuat"
          cause={`Database menjawab: ${settingsResult.error.message}`}
          action={<ReloadButton />}
        />
      </Panel>
    );
  }
  const row = settingsResult.data;
  if (!row) {
    return (
      <Panel>
        <EmptyState title="Baris Parameter belum ada di database">
          Tabel settings seharusnya berisi satu baris (id = 1) dari migrasi awal. Jalankan ulang migrasi
          stations_settings atau hubungi pengelola aplikasi; formulir ini hanya mengubah baris yang sudah ada.
        </EmptyState>
      </Panel>
    );
  }

  const initial = settingsToFormValues(row);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">Terakhir diubah {formatWaktu(row.updated_at) ?? "tidak diketahui"} WIB.</p>
      <SettingsForm initial={initial} />
    </div>
  );
}

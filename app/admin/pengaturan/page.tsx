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

export const metadata: Metadata = { title: "Parameter" };

export default function PengaturanPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Parameter" />
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
          cause="Data parameter tidak terbaca saat ini."
          action={<ReloadButton />}
        />
      </Panel>
    );
  }
  const row = settingsResult.data;
  if (!row) {
    return (
      <Panel>
        <EmptyState title="Parameter belum tersedia">Hubungi pengelola aplikasi.</EmptyState>
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

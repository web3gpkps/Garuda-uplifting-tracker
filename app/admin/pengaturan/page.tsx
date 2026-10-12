import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { ReloadButton } from "@/components/ui/ReloadButton";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { settingsToFormValues } from "@/components/admin/settings-schema";
import { formatWaktu } from "@/components/admin/format";
import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Parameter" };

const TITLE = "Parameter";

export default function PengaturanPage() {
  return (
    <Suspense fallback={<PageLoading title={TITLE} label="Memuat parameter" />}>
      <SettingsData />
    </Suspense>
  );
}

async function SettingsData() {
  await requireAdmin();
  const supabase = await createClient();
  const settingsResult = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();

  if (settingsResult.error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={TITLE} />
        <Panel>
          <ErrorState title="Parameter tidak bisa dimuat" cause="Server tidak menjawab." action={<ReloadButton>Coba lagi</ReloadButton>} />
        </Panel>
      </div>
    );
  }
  const row = settingsResult.data;
  if (!row) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={TITLE} />
        <Panel>
          <EmptyState title="Parameter belum tersedia">Hubungi pengelola aplikasi.</EmptyState>
        </Panel>
      </div>
    );
  }

  const initial = settingsToFormValues(row);

  const changed = formatWaktu(row.updated_at);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={TITLE} meta={changed ? `Diubah ${changed} WIB` : undefined} />
      <SettingsForm initial={initial} />
    </div>
  );
}

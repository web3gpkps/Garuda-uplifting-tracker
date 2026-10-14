import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountScreenRoute } from "@/components/shell/ScreenRoute";
import { LaporanLoading, LaporanScreen } from "@/components/laporan/LaporanScreen";

export const metadata: Metadata = { title: "Laporan Mingguan" };

/** Laporan Mingguan, signed-in branch account (scope from the account's branch). The screen is shared with /admin/laporan. */
export default function Page({ searchParams }: PageProps<"/cabang/laporan">) {
  return (
    <Suspense fallback={<LaporanLoading />}>
      <AccountScreenRoute searchParams={searchParams} screen={LaporanScreen} />
    </Suspense>
  );
}

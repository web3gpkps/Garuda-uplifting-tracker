import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountScreenRoute } from "@/components/shell/ScreenRoute";
import { PerformaLoading, PerformaScreen } from "@/components/performa/PerformaScreen";

export const metadata: Metadata = { title: "Penilaian Mingguan" };

/** Penilaian Mingguan, signed-in branch account (scope from the account's branch). The screen is shared with /admin/performa. */
export default function Page({ searchParams }: PageProps<"/cabang/performa">) {
  return (
    <Suspense fallback={<PerformaLoading />}>
      <AccountScreenRoute searchParams={searchParams} screen={PerformaScreen} />
    </Suspense>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountScreenRoute } from "@/components/shell/ScreenRoute";
import { TindakLanjutLoading, TindakLanjutScreen } from "@/components/tindak-lanjut/TindakLanjutScreen";

export const metadata: Metadata = { title: "Tindak Lanjut" };

/** Tindak Lanjut, signed-in branch account (scope from the account's branch). The screen is shared with /admin/tindak-lanjut. */
export default function Page({ searchParams }: PageProps<"/cabang/tindak-lanjut">) {
  return (
    <Suspense fallback={<TindakLanjutLoading />}>
      <AccountScreenRoute searchParams={searchParams} screen={TindakLanjutScreen} />
    </Suspense>
  );
}

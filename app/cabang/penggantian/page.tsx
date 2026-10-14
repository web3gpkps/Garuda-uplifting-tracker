import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountScreenRoute } from "@/components/shell/ScreenRoute";
import { PenggantianLoading, PenggantianScreen } from "@/components/penggantian/PenggantianScreen";

export const metadata: Metadata = { title: "Penggantian SDM" };

/** Penggantian SDM, signed-in branch account (scope from the account's branch). The screen is shared with /admin/penggantian. */
export default function Page({ searchParams }: PageProps<"/cabang/penggantian">) {
  return (
    <Suspense fallback={<PenggantianLoading />}>
      <AccountScreenRoute searchParams={searchParams} screen={PenggantianScreen} />
    </Suspense>
  );
}

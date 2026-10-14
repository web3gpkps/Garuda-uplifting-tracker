import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountScreenRoute } from "@/components/shell/ScreenRoute";
import { SdmLoading, SdmScreen } from "@/components/sdm/SdmScreen";

export const metadata: Metadata = { title: "Data SDM" };

/** Data SDM, signed-in branch account (scope from the account's branch). The screen is shared with /admin/sdm. */
export default function Page({ searchParams }: PageProps<"/cabang/sdm">) {
  return (
    <Suspense fallback={<SdmLoading />}>
      <AccountScreenRoute searchParams={searchParams} screen={SdmScreen} />
    </Suspense>
  );
}

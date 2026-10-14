import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountScreenRoute } from "@/components/shell/ScreenRoute";
import { RemedialLoading, RemedialScreen } from "@/components/remedial/RemedialScreen";

// Training results: the title never carries a name or a score.
export const metadata: Metadata = { title: "Remedial" };

/** Remedial, signed-in branch account (scope from the account's branch). The screen is shared with /admin/remedial. */
export default function Page({ searchParams }: PageProps<"/cabang/remedial">) {
  return (
    <Suspense fallback={<RemedialLoading />}>
      <AccountScreenRoute searchParams={searchParams} screen={RemedialScreen} />
    </Suspense>
  );
}

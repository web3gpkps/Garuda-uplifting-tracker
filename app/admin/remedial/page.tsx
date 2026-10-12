import { Suspense } from "react";
import type { Metadata } from "next";
import { OwnerScreenRoute } from "@/components/shell/ScreenRoute";
import { RemedialLoading, RemedialScreen } from "@/components/remedial/RemedialScreen";

// Training results: the title never carries a name or a score.
export const metadata: Metadata = { title: "Remedial" };

/** Remedial, owner (all stations). The screen is shared with /s/[token]/remedial. */
export default function Page({ searchParams }: PageProps<"/admin/remedial">) {
  return (
    <Suspense fallback={<RemedialLoading />}>
      <OwnerScreenRoute searchParams={searchParams} screen={RemedialScreen} />
    </Suspense>
  );
}

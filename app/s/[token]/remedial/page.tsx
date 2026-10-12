import { Suspense } from "react";
import type { Metadata } from "next";
import { LinkScreenRoute } from "@/components/shell/ScreenRoute";
import { RemedialLoading, RemedialScreen } from "@/components/remedial/RemedialScreen";

// Training results: the title never carries a name or a score.
export const metadata: Metadata = { title: "Remedial" };

/** Remedial, station link (scope from the token). The screen is shared with /admin/remedial. */
export default function Page({ params, searchParams }: PageProps<"/s/[token]/remedial">) {
  return (
    <Suspense fallback={<RemedialLoading />}>
      <LinkScreenRoute params={params} searchParams={searchParams} screen={RemedialScreen} />
    </Suspense>
  );
}

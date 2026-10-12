import { Suspense } from "react";
import type { Metadata } from "next";
import type { SearchParams } from "@/lib/workspace";
import { LinkScreenRoute } from "@/components/shell/ScreenRoute";
import { AcuanLoading, AcuanScreen } from "@/components/acuan/AcuanScreen";

export const metadata: Metadata = { title: "Acuan PDF" };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<SearchParams> };

/**
 * Acuan PDF, station link. Static reference numbers, but still behind the token gate
 * (layouts do not re-run on client navigation). The screen is shared with /admin/acuan.
 */
export default function Page({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<AcuanLoading />}>
      <LinkScreenRoute params={params} searchParams={searchParams} screen={AcuanScreen} />
    </Suspense>
  );
}

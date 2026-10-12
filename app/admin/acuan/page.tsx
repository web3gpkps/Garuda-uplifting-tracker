import { Suspense } from "react";
import type { Metadata } from "next";
import type { SearchParams } from "@/lib/workspace";
import { OwnerScreenRoute } from "@/components/shell/ScreenRoute";
import { AcuanLoading, AcuanScreen } from "@/components/acuan/AcuanScreen";

export const metadata: Metadata = { title: "Acuan PDF" };

type Props = { searchParams: Promise<SearchParams> };

/** Acuan PDF, owner. The screen is shared with /s/[token]/acuan. */
export default function Page({ searchParams }: Props) {
  return (
    <Suspense fallback={<AcuanLoading />}>
      <OwnerScreenRoute searchParams={searchParams} screen={AcuanScreen} />
    </Suspense>
  );
}

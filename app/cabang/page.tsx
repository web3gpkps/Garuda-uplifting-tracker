import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountScreenRoute } from "@/components/shell/ScreenRoute";
import { RingkasanLoading, RingkasanScreen } from "@/components/ringkasan/RingkasanScreen";

export const metadata: Metadata = { title: "Beranda" };

// Sits in the same segment as the account gate, which must reach the database on every request.
export const instant = false;

/** Beranda, signed-in branch account (scope from the account's branch). The screen is shared with /admin. */
export default function Page({ searchParams }: PageProps<"/cabang">) {
  return (
    <Suspense fallback={<RingkasanLoading />}>
      <AccountScreenRoute searchParams={searchParams} screen={RingkasanScreen} />
    </Suspense>
  );
}

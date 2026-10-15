import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountScreenRoute } from "@/components/shell/ScreenRoute";
import { redirect } from "next/navigation";
import { hrefs, type ScreenProps } from "@/lib/workspace";
import { isBranchBmiView } from "@/components/shell/cgk-bmi";
import { RingkasanLoading, RingkasanScreen } from "@/components/ringkasan/RingkasanScreen";

/** A single-station account has the Cek BMI menu only: its home is Cek BMI. KPS accounts keep Beranda. */
function BranchHome(props: ScreenProps) {
  if (isBranchBmiView(props.access, props.ws)) redirect(hrefs(props.access).bmi);
  return <RingkasanScreen {...props} />;
}

export const metadata: Metadata = { title: "Beranda" };

// Sits in the same segment as the account gate, which must reach the database on every request.
export const instant = false;

/** Beranda, signed-in branch account (scope from the account's branch). The screen is shared with /admin. */
export default function Page({ searchParams }: PageProps<"/cabang">) {
  return (
    <Suspense fallback={<RingkasanLoading />}>
      <AccountScreenRoute searchParams={searchParams} screen={BranchHome} bmiOnlyOk />
    </Suspense>
  );
}

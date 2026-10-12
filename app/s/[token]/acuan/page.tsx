import { Suspense } from "react";
import { redirect } from "next/navigation";

/** Removed page: old /s/<token>/acuan links land on Beranda. */
export default function Page({ params }: PageProps<"/s/[token]/acuan">) {
  return (
    <Suspense fallback={null}>
      <RedirectHome params={params} />
    </Suspense>
  );
}

async function RedirectHome({ params }: { params: PageProps<"/s/[token]/acuan">["params"] }): Promise<null> {
  const { token } = await params;
  redirect(`/s/${encodeURIComponent(token)}`);
}

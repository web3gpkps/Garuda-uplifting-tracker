import { redirect } from "next/navigation";

/** Removed page: old /admin/acuan links land on Beranda. */
export default function Page() {
  redirect("/admin");
}

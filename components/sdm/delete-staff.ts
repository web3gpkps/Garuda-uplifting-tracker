/**
 * Owner-only "Hapus SDM" (docs/SPEC.md access model; phase-2 brief): deletes one staff row
 * with the owner's cookie client under the admin RLS policy. The database cascades the
 * row's weekly_scores, bmi_checks and remedials and sets replacements.staff_code to NULL.
 *
 * Pure logic, separate from the Server Action so it can be unit-tested with a fake client
 * (delete-staff.test.ts). The guard is here too: anything but owner access is refused
 * before a query is sent.
 */
import type { LinkError } from "@/lib/workspace/errors";

type DbError = { message: string; code?: string };
type DbResult = { data?: unknown; error: DbError | null; count?: number | null };

/** The slice of the supabase-js client this module uses (the real client satisfies it at runtime). */
type DependentTable = "weekly_scores" | "bmi_checks" | "remedials" | "replacements";

export type StaffDeleteClient = {
  from(table: "staff" | DependentTable): {
    select(columns: string, options?: { count: "exact"; head: true }): {
      eq(column: string, value: string): PromiseLike<DbResult>;
    };
    delete(options: { count: "exact" }): {
      eq(column: string, value: string): PromiseLike<DbResult>;
    };
  };
};

export type DeleteStaffResult =
  | {
      ok: true;
      code: string;
      name: string;
      /** Rows removed with the staff member (cascade) and replacement rows left unlinked. */
      weeklyScores: number;
      bmiChecks: number;
      remedials: number;
      replacements: number;
    }
  | { ok: false; error: LinkError };

const NOT_OWNER: LinkError = {
  code: "unauthorized",
  message: "Hanya pemilik aplikasi yang bisa menghapus SDM.",
};

/** Database failures are reported in plain words; the raw text is never shown. */
const FAILED: DeleteStaffResult = { ok: false, error: { code: "unknown", message: "Tidak bisa dihapus. Coba lagi." } };

export async function deleteStaffAs(
  access: { kind: "owner" | "link" | "account" },
  client: StaffDeleteClient | null,
  code: unknown,
): Promise<DeleteStaffResult> {
  if (access.kind !== "owner" || !client) return { ok: false, error: NOT_OWNER };
  if (typeof code !== "string" || code.trim() === "") {
    return { ok: false, error: { code: "invalid_input", field: "code", message: "Kode SDM tidak dikenal. Muat ulang halaman." } };
  }

  const found = await client.from("staff").select("code, name").eq("code", code);
  if (found.error) return FAILED;
  const row = Array.isArray(found.data) ? (found.data[0] as { code: string; name: string } | undefined) : undefined;
  if (!row) {
    return { ok: false, error: { code: "unknown", message: `SDM ${code} tidak ditemukan; mungkin sudah dihapus. Muat ulang halaman.` } };
  }

  const count = (table: DependentTable) =>
    client.from(table).select("id", { count: "exact", head: true }).eq("staff_code", code);
  const [scores, checks, remedials, replacements] = await Promise.all([
    count("weekly_scores"),
    count("bmi_checks"),
    count("remedials"),
    count("replacements"),
  ]);
  for (const r of [scores, checks, remedials, replacements]) if (r.error) return FAILED;

  const removed = await client.from("staff").delete({ count: "exact" }).eq("code", code);
  if (removed.error) return FAILED;
  // RLS hides the row from a non-admin session: nothing deleted, no error.
  if (!removed.count) return { ok: false, error: NOT_OWNER };

  return {
    ok: true,
    code: row.code,
    name: row.name,
    weeklyScores: scores.count ?? 0,
    bmiChecks: checks.count ?? 0,
    remedials: remedials.count ?? 0,
    replacements: replacements.count ?? 0,
  };
}

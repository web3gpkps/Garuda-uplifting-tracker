/*
 * Penggantian SDM: the shape a save sends and its checks before the database is called.
 * Pure (no server-only import), shared by the Server Actions and unit-tested in
 * replacement-input.test.ts. The database checks everything again (share_save_replacement).
 */
import { isValidIsoDate } from "@/lib/dates";
import { PROGRAMS } from "@/lib/rules";
import type { LinkError } from "@/lib/workspace/errors";

export type ReplacementInput = {
  /** null inserts a new row. */
  id: number | null;
  /** 'IULS' | 'RUST'; null takes the program of the chosen staff (database). */
  program: string | null;
  /** KPS chooses; a station link is forced to its own station by the database. */
  station: string | null;
  staffCode: string | null;
  replacedName: string | null;
  reason: string | null;
  withdrawnOn: string | null;
  replacementName: string | null;
  effectiveOn: string | null;
  trainingOn: string | null;
  /** 0..100. */
  postTest: number | null;
  /** Nilai akhir training, 0..100. */
  finalResult: number | null;
  reported: "Ya" | "Belum" | null;
  notes: string | null;
};

function invalid(field: string, message: string): LinkError {
  return { code: "invalid_input", field, message };
}

function textOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function dateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && isValidIsoDate(value));
}

function scoreOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);
}

/** The first problem with a save, as the database would name it (field = DB column), or null. */
export function checkReplacementInput(input: ReplacementInput | null | undefined): LinkError | null {
  if (!input || (input.id !== null && !Number.isInteger(input.id))) {
    return invalid("id", "Baris penggantian tidak dikenal. Muat ulang halaman lalu coba lagi.");
  }
  if (input.program !== null && !(PROGRAMS as readonly string[]).includes(input.program)) {
    return invalid("program", "Pilih program IULS atau RUST.");
  }
  const texts = {
    station: input.station,
    staff_code: input.staffCode,
    replaced_name: input.replacedName,
    reason: input.reason,
    replacement_name: input.replacementName,
    notes: input.notes,
  };
  for (const [field, value] of Object.entries(texts)) {
    if (!textOrNull(value)) return invalid(field, "Isian teks tidak valid.");
  }
  if (input.replacedName === null || input.replacedName.trim() === "") {
    if (input.staffCode === null) return invalid("replaced_name", "Isi nama SDM yang diganti.");
  }
  const dates = { withdrawn_on: input.withdrawnOn, effective_on: input.effectiveOn, training_on: input.trainingOn };
  for (const [field, value] of Object.entries(dates)) {
    if (!dateOrNull(value)) return invalid(field, "Tanggal tidak valid.");
  }
  if (!scoreOrNull(input.postTest)) return invalid("post_test", "Post-test harus angka 0 sampai 100.");
  if (!scoreOrNull(input.finalResult)) return invalid("final_result", "Nilai akhir harus angka 0 sampai 100.");
  if (input.reported !== null && input.reported !== "Ya" && input.reported !== "Belum") {
    return invalid("reported", "Pilih Ya, Belum, atau kosongkan.");
  }
  return null;
}

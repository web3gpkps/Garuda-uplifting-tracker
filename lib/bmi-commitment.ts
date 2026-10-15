/*
 * Komitmen/Target: the sixth column of every BMI check. A person whose BMI is not Normal gets a
 * note there (for example a weight target); a Normal result needs none and reads "Sudah Ideal",
 * which the database writes by itself (supabase/migrations/20261015100000_bmi_commitment.sql). The
 * screens use the same rule at once, before the save comes back. Pure: no React, no server code.
 */
import type { BmiCategory } from "./rules";

export const COMMITMENT_LABEL = "Komitmen/Target";
/** What a Normal check reads in the Komitmen/Target column. */
export const COMMITMENT_IDEAL = "Sudah Ideal";
/** Longest commitment the database accepts (bmi_checks_commitment_check). */
export const COMMITMENT_MAX = 500;

/** True when the person is asked for a commitment: any category but Normal. */
export function needsCommitment(category: BmiCategory | null): boolean {
  return category !== null && category !== "Normal";
}

/** The text a check stores: "Sudah Ideal" when Normal, else what the person typed (empty is none). */
export function commitmentToSave(category: BmiCategory | null, typed: string | null | undefined): string | null {
  if (category === "Normal") return COMMITMENT_IDEAL;
  if (!needsCommitment(category)) return null;
  const text = (typed ?? "").trim();
  return text === "" ? null : text;
}

/** What the commitment cell of a check shows, and whether the person can type in it. */
export function commitmentCell(
  category: BmiCategory | null,
  stored: string | null | undefined,
): { text: string; editable: boolean } {
  if (category === "Normal") return { text: COMMITMENT_IDEAL, editable: false };
  if (!needsCommitment(category)) return { text: "", editable: false };
  return { text: stored === COMMITMENT_IDEAL ? "" : (stored ?? ""), editable: true };
}

/**
 * What the commitment input starts with for a stored check: the typed text of a check that is not Normal,
 * and nothing for a Normal one (its "Sudah Ideal" is not text to edit, so it must not turn up in the
 * input when the numbers are changed to something above Normal).
 */
export function commitmentDraft(category: BmiCategory | null, stored: string | null | undefined): string {
  const cell = commitmentCell(category, stored);
  return cell.editable ? cell.text : "";
}

/** A typed commitment checked before it is sent: null when fine. */
export function commitmentError(typed: string): string | null {
  return typed.trim().length > COMMITMENT_MAX ? `Paling panjang ${COMMITMENT_MAX} karakter.` : null;
}

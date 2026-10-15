/*
 * Sheet structure numbers for the Cek BMI screen. The names of the checks come from
 * lib/bmi-periods.ts (bmiCheckLabel, bmiCheckName), the one source for the screens, the CSV and the sheet.
 */

import { COMMITMENT_LABEL } from "@/lib/bmi-commitment";

/** The Google Sheet tab this screen mirrors (lib/sync/layouts.ts BMI_TAB). */
export const BMI_SHEET_TAB = "Cek BMI 2 Mingguan";

/** Written under the header of the first check, the one taken during the Coaching Assessment. */
export const COACHING_CHECK_NOTE = "Pengecekan Saat Coaching Assessment";
/** Why the first check cannot be changed here. The only place the screens name the Google Sheet. */
export const COACHING_LOCKED_HINT = "Data cek ini hanya bisa diubah di Google Sheet.";

/** Identity columns before the first period (No ... Ada Catatan BMI). */
const IDENTITY_COLUMNS = 9;
/** The columns of every period, in order; the table and the CSV use the same words. */
export const PERIOD_FIELD_LABELS = ["Tgl Cek", "Tinggi (cm)", "Berat (kg)", "BMI", "Kategori", COMMITMENT_LABEL] as const;
export const PERIOD_COLUMNS = PERIOD_FIELD_LABELS.length;

/** Jumlah Cek ... Catatan Program Kebugaran. */
const SUMMARY_COLUMNS = 8;

/** Spreadsheet column letters: 1 is A, 26 is Z, 27 is AA, 47 is AU. */
export function columnLetters(n: number): string {
  let out = "";
  for (let rest = n; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    out = String.fromCharCode(65 + ((rest - 1) % 26)) + out;
  }
  return out;
}

/** Columns of the sheet tab for this many periods: the nine identity columns, one group per period, eight summary columns. */
export function sheetColumnCount(periods: number): number {
  return IDENTITY_COLUMNS + PERIOD_COLUMNS * periods + SUMMARY_COLUMNS;
}

/** "A–AU": the column range of the sheet tab. */
export function sheetColumnRange(periods: number): string {
  return `A–${columnLetters(sheetColumnCount(periods))}`;
}

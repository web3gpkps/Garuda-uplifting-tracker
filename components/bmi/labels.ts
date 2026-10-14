/*
 * Sheet structure numbers for the Cek BMI screen. The names of the checks come from
 * lib/bmi-periods.ts (bmiCheckLabel, bmiCheckName), the one source for the screens, the CSV and the sheet.
 */

/** The Google Sheet tab this screen mirrors (lib/sync/layouts.ts BMI_TAB). */
export const BMI_SHEET_TAB = "Cek BMI 2 Mingguan";

/** Identity columns before the first period (No ... Ada Catatan BMI). */
const IDENTITY_COLUMNS = 9;
/** The five columns of every period, in order; the table and the CSV use the same words. */
export const PERIOD_FIELD_LABELS = ["Tgl Cek", "Tinggi (cm)", "Berat (kg)", "BMI", "Kategori"] as const;
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

/** Columns of the sheet tab for this many periods: the nine identity columns, five per period, eight summary columns. */
export function sheetColumnCount(periods: number): number {
  return IDENTITY_COLUMNS + PERIOD_COLUMNS * periods + SUMMARY_COLUMNS;
}

/** "A–AU": the column range of the sheet tab. */
export function sheetColumnRange(periods: number): string {
  return `A–${columnLetters(sheetColumnCount(periods))}`;
}

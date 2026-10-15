/*
 * "Ekspor CSV": the rows currently in view as one CSV file. Pure, covered by csv.test.ts.
 * UTF-8 with a BOM (Excel reads the accents), CRLF between records, every field quoted,
 * and a field that starts with = + @ or - gets a leading apostrophe so a spreadsheet never
 * runs it as a formula (CSV injection).
 */
import { bmiCheckLabels } from "@/lib/bmi-periods";
import { commitmentCell } from "@/lib/bmi-commitment";
import { PERIOD_FIELD_LABELS } from "./labels";
import type { Settings } from "@/lib/rules";
import { hasNoteLabel } from "./summary";
import { idOf, type BmiRowView } from "./tracker-model";

/** Quotes one field. null and undefined are empty. */
export function csvField(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Tab and carriage return are also read as the start of a formula by some spreadsheets.
  const neutral = text.replace(/^[=+@\-\t\r]/, (first) => `'${first}`);
  return `"${neutral.replace(/"/g, '""')}"`;
}

export function csvDocument(headers: readonly string[], records: ReadonlyArray<readonly unknown[]>): string {
  const lines = [headers, ...records].map((record) => record.map(csvField).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}

/** "CGK_BMI_SUB_2026-10-14.csv". The scope is a station code or "KPS"; anything else is made file-safe. */
export function csvFilename(scope: string, today: string): string {
  const safe = scope.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "semua";
  return `CGK_BMI_${safe}_${today}.csv`;
}

/** What the headers need of the settings: the dates and the number of checks. */
export type CsvPeriods = Pick<Settings, "bmiFirstCheck" | "bmiIntervalDays" | "bmiPeriods">;

/** Nine identity columns, one group per period headed by the full check label, then eight summary columns. */
export function bmiCsvHeaders(settings: CsvPeriods, idLabel = "ID SDM"): string[] {
  const headers = [
    "No",
    idLabel,
    "Nama Petugas",
    "Unit",
    "Touch Point",
    "L/P",
    "Coaching Evaluation Feedback",
    "Result/Remarks",
    "Ada Catatan BMI",
  ];
  for (const label of bmiCheckLabels(settings)) {
    for (const field of PERIOD_FIELD_LABELS) headers.push(`${label}: ${field}`);
  }
  headers.push(
    "Jumlah Cek",
    "Tgl Cek Terakhir",
    "BMI Terakhir",
    "Kategori Terakhir",
    "Delta Berat",
    "Cek Berikutnya",
    "Status Jadwal",
    "Catatan Program Kebugaran",
  );
  return headers;
}

/** One record per row in view, in the order of bmiCsvHeaders. */
export function bmiCsvRecords(views: readonly BmiRowView[], periods: number): unknown[][] {
  return views.map(({ row, summary }, index) => {
    const record: unknown[] = [
      index + 1,
      idOf(row),
      row.name,
      row.station,
      row.touchPoint,
      row.gender,
      row.feedback,
      row.remarks,
      hasNoteLabel(row.hasNote),
    ];
    for (let i = 0; i < periods; i++) {
      const check = row.checks[i] ?? null;
      const value = summary.periods[i] ?? null;
      record.push(
        check?.date,
        check?.heightCm,
        check?.weightKg,
        value?.bmi,
        value?.category,
        check ? commitmentCell(value?.category ?? null, check.commitment).text : undefined,
      );
    }
    record.push(
      summary.checks,
      summary.lastCheckDate,
      summary.latestBmi,
      summary.latestCategory,
      summary.weightDelta,
      summary.nextCheck,
      summary.scheduleStatus,
      row.fitnessNote,
    );
    return record;
  });
}

/** The whole file for the rows in view. */
export function bmiCsv(views: readonly BmiRowView[], settings: CsvPeriods, idLabel = "ID SDM"): string {
  return csvDocument(bmiCsvHeaders(settings, idLabel), bmiCsvRecords(views, settings.bmiPeriods));
}

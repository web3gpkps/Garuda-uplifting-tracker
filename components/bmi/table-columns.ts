/*
 * Column widths of the Cek BMI table, in px. The table is fixed-layout, so these are the real
 * widths; the sticky offsets in app/globals.css (48 + 120 = 168) and the period window's
 * arithmetic (period-window.ts) rely on them. Pure, so a test can check the sums.
 */
import { PERIOD_FIELD_LABELS } from "./labels";
import type { TableGeometry } from "./period-window";

export const W = {
  no: 48,
  id: 120,
  name: 204,
  unit: 74,
  touch: 160,
  sex: 70,
  feedback: 205,
  remarks: 180,
  yn: 123,
  date: 128,
  measure: 100,
  bmi: 78,
  cat: 118,
  commitment: 220,
  summary: 130,
  summaryWide: 186,
  comment: 260,
} as const;

/** Room for the one-line text of a text cell: its width less the padding and the toggle. */
export const textWidth = (col: number) => col - 47;

export type Column = { label: string; width: number; className?: string };

export const IDENTITY: Column[] = [
  { label: "No", width: W.no, className: "sticky sticky1" },
  { label: "ID SDM", width: W.id, className: "sticky sticky2" },
  { label: "Nama Petugas", width: W.name, className: "sticky sticky3" },
  { label: "Unit", width: W.unit },
  { label: "Touch Point", width: W.touch },
  { label: "L/P", width: W.sex },
  { label: "Coaching Evaluation", width: W.feedback },
  { label: "Result/Remarks", width: W.remarks },
  { label: "Ada Catatan BMI", width: W.yn },
];

const PERIOD_WIDTHS = [W.date, W.measure, W.measure, W.bmi, W.cat, W.commitment] as const;
export const PERIOD_FIELDS: Column[] = PERIOD_FIELD_LABELS.map((label, i) => ({ label, width: PERIOD_WIDTHS[i] }));

export const SUMMARY: Column[] = [
  { label: "Jumlah Cek", width: W.summary, className: "summary-tint" },
  { label: "Tgl Cek Terakhir", width: W.date },
  { label: "BMI Terakhir", width: W.bmi },
  { label: "Kategori Terakhir", width: W.cat },
  { label: "Delta Berat (kg)", width: W.summary },
  { label: "Cek Berikutnya", width: W.date },
  { label: "Status Jadwal", width: W.summaryWide },
  { label: "Catatan Program Kebugaran", width: W.comment },
];

const sum = (columns: readonly Column[]) => columns.reduce((total, column) => total + column.width, 0);

/** What period-window.ts needs: the leading columns, one period group, the frozen columns. */
export const GEOMETRY: TableGeometry = {
  leading: sum(IDENTITY),
  perPeriod: sum(PERIOD_FIELDS),
  frozen: IDENTITY.filter((column) => column.className?.includes("sticky")).reduce((total, column) => total + column.width, 0),
};

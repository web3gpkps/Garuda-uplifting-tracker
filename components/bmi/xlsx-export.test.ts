import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { DEFAULT_SETTINGS } from "@/lib/rules";
import { COMMITMENT_IDEAL } from "@/lib/bmi-commitment";
import { THRESHOLD_NAMES, bmiFormula, buildBmiWorkbook, categoryFormula } from "@/lib/xlsx/bmi";
import { summarizeRow, trackerMetrics, type BmiRowView, type BmiTrackerRow } from "./tracker-model";
import { bmiExportInput, xlsxFilename, type BmiExportState } from "./xlsx-export";

const settings = { ...DEFAULT_SETTINGS, bmiFirstCheck: "2026-10-12", bmiIntervalDays: 14, bmiPeriods: 2 };
const today = "2026-10-20";
const rowA: BmiTrackerRow = {
  code: "GA-01",
  name: "Petugas uji",
  station: "CGK",
  touchPoint: "Check-in Counter",
  gender: "P",
  feedback: "Komunikasi baik",
  remarks: "Lanjut",
  hasNote: true,
  fitnessNote: "=1+1",
  assignmentStatus: "Aktif",
  changed: null,
  checks: [{ date: "2026-10-12", heightCm: 170, weightKg: 60, commitment: null }, null],
} as BmiTrackerRow;
const rowB = {
  ...rowA,
  code: "GA-02",
  name: "Petugas dua",
  hasNote: false,
  fitnessNote: null,
  checks: [
    { date: "2026-10-12", heightCm: 165, weightKg: 75, commitment: "Turun 2 kg" },
    { date: "2026-10-26", heightCm: 165, weightKg: 72.5, commitment: "Turun 2 kg lagi" },
  ],
} as BmiTrackerRow;
const views: BmiRowView[] = [rowA, rowB].map((row) => ({ row, summary: summarizeRow(row, settings, today) }));
const labels = ["BMI Cek ke-1 (Periode 12-25 Oct 2026)", "BMI Cek ke-2 (Periode 26 Oct-8 Nov 2026)"];

const state = (patch: Partial<BmiExportState> = {}): BmiExportState => ({
  views,
  filtered: views,
  metrics: trackerMetrics(views, 1),
  settings,
  labels,
  period: 1,
  currentPeriod: 1,
  viewAll: true,
  query: "",
  status: "all",
  touchPoint: "",
  category: "all",
  station: null,
  idLabel: "ID SDM",
  scope: { chip: "Unit CGK", foot: "Petugas di Unit CGK" },
  now: new Date("2026-10-15T15:31:00Z"),
  ...patch,
});

async function sheet(s: BmiExportState) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildBmiWorkbook(ExcelJS, { ...bmiExportInput(s), logos: [] }));
  return wb;
}
const text = (v: unknown) => (v && typeof v === "object" && "richText" in v ? (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("") : v);

describe("Garuda Excel export matches the screen", () => {
  test("file name keeps the export's old prefix", () => {
    expect(xlsxFilename("CGK", "2026-10-14")).toBe("CGK_BMI_CGK_2026-10-14.xlsx");
  });

  test("headers: nine identity columns, six per check, eight summary columns", async () => {
    const ws = (await sheet(state())).getWorksheet("Cek BMI")!;
    const fields = (ws.getRow(14).values as unknown[]).slice(1);
    expect(fields).toHaveLength(9 + 6 * 2 + 8);
    expect(fields.slice(0, 9)).toEqual(["No", "ID SDM", "Nama Petugas", "Unit", "Touch Point", "L/P", "Coaching Evaluation", "Result/Remarks", "Ada Catatan BMI"]);
    expect(fields.slice(9, 15)).toEqual(["Tgl Cek", "Tinggi (cm)", "Berat (kg)", "BMI", "Kategori", "Komitmen/Target"]);
    expect(fields.slice(-8)).toEqual(["Jumlah Cek", "Tgl Cek Terakhir", "BMI Terakhir", "Kategori Terakhir", "Delta Berat (kg)", "Cek Berikutnya", "Status Jadwal", "Catatan Program Kebugaran"]);
  });

  test("values, live formulas and commitments", async () => {
    const ws = (await sheet(state())).getWorksheet("Cek BMI")!;
    const a = ws.getRow(15);
    expect([a.getCell(4).value, a.getCell(5).value, a.getCell(9).value]).toEqual(["CGK", "Check-in Counter", "Ya"]);
    expect(a.getCell(13).value).toMatchObject({ formula: bmiFormula("K15", "L15"), result: 20.8 });
    expect(a.getCell(14).value).toMatchObject({ formula: categoryFormula("M15"), result: "Normal" });
    expect(a.getCell(15).value).toBe(COMMITMENT_IDEAL); // Normal reads "Sudah Ideal", as on screen
    expect(a.getCell(29).value).toBe("=1+1"); // a note that looks like a formula stays text
    const b = ws.getRow(16);
    expect(b.getCell(9).value).toBe("Tidak");
    expect(b.getCell(20).value).toMatchObject({ result: "Overweight" });
    expect(b.getCell(21).value).toBe("Turun 2 kg lagi");
    expect(b.getCell(22).value).toBe(2); // Jumlah Cek
    expect(b.getCell(26).value).toBe(-2.5); // Delta Berat
  });

  test("the touch point filter and Fokus periode are carried over", async () => {
    const ws = (await sheet(state({ touchPoint: "Check-in Counter", viewAll: false, period: 2 }))).getWorksheet("Cek BMI")!;
    expect(String(text(ws.getCell(11, 1).value))).toContain("Touch Point: Check-in Counter");
    expect((ws.getRow(14).values as unknown[]).slice(1)).toHaveLength(9 + 6 + 8);
  });

  test("threshold names exist for the Kategori formulas", async () => {
    const names = (await sheet(state())).definedNames.model.map((d) => d.name);
    for (const name of Object.values(THRESHOLD_NAMES)) expect(names).toContain(name);
  });
});

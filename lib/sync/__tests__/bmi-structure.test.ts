/* eslint-disable @typescript-eslint/no-explicit-any -- Sheets request objects are inspected loosely in these tests */
/**
 * planBmiStructure on a snapshot of the in-memory Garuda workbook: which Sheets requests it asks for
 * when the number of checks, the interval or the first date change, and that it asks for nothing
 * when the tab already matches. (The formulas themselves are checked against real Google Sheets in
 * scripts, see docs/SYNC.md.)
 */
import { describe, expect, test } from "bun:test";
import { bmiCheckLabels } from "../../bmi-periods";
import { BMI_SHEET, colLetter, isCurrent, laporanLabelFormula, laporanSlotFormula, planBmiStructure, planCommitmentColumns, summaryFormulas, type BmiStructureSettings } from "../bmi-structure";
import type { RealTab } from "../layouts";
import { smallDb } from "../testing/fixtures";
import { buildWorkbook } from "../testing/workbook";

const S6: BmiStructureSettings = { bmiFirstCheck: "2026-10-12", bmiIntervalDays: 14, bmiPeriods: 6 };
const FIRST = 9; // J
const W = 6; // columns per group: Tgl Cek, Tinggi, Berat, BMI, Kategori, Komitmen/Target
const SUMMARY_FIRST = FIRST + W * 6; // AT with six groups

function tabs(commitmentColumn = true) {
  const snap = buildWorkbook(smallDb(), { commitmentColumn }).snapshot();
  return { bmi: structuredClone(snap.tabs[BMI_SHEET]!) as RealTab, parameter: structuredClone(snap.tabs.Parameter!) as RealTab };
}

const put = (tab: RealTab, row: number, col: number, value: unknown, formula?: string) => {
  while (tab.values.length < row) tab.values.push([]);
  while (tab.formulas.length < row) tab.formulas.push([]);
  tab.values[row - 1][col] = value;
  tab.formulas[row - 1][col] = formula ?? value;
};

/** The tab as the manager leaves it for `settings` (so a second run has nothing to do). */
function converged(tab: RealTab, settings: BmiStructureSettings): RealTab {
  const t = structuredClone(tab);
  bmiCheckLabels(settings).forEach((label, i) => put(t, 4, FIRST + W * i, label));
  const last = FIRST + W * settings.bmiPeriods - 1;
  const columns = Object.fromEntries(
    ["count", "lastDate", "lastBmi", "lastCategory", "delta", "next", "status", "note", "reportBmi", "reportCategory"].map((k, i) => [k, SUMMARY_FIRST + i + (k === "reportBmi" ? 1 : k === "reportCategory" ? 1 : 0)]),
  );
  void columns;
  const formulas = summaryFormulas(FIRST, last, {
    count: SUMMARY_FIRST, lastDate: SUMMARY_FIRST + 1, lastBmi: SUMMARY_FIRST + 2, lastCategory: SUMMARY_FIRST + 3, delta: SUMMARY_FIRST + 4,
    next: SUMMARY_FIRST + 5, status: SUMMARY_FIRST + 6, note: SUMMARY_FIRST + 7, reportBmi: SUMMARY_FIRST + 8, reportCategory: SUMMARY_FIRST + 9,
  });
  const cols = { count: 0, lastDate: 1, lastBmi: 2, lastCategory: 3, delta: 4, next: 5, reportBmi: 8, reportCategory: 9 } as const;
  for (const [k, f] of Object.entries(formulas)) put(t, 6, SUMMARY_FIRST + cols[k as keyof typeof cols], "", f);
  put(t, 4, 4, "Touch Point");
  return t;
}

describe("planBmiStructure", () => {
  test("a tab that already matches the settings needs nothing", () => {
    const { bmi } = tabs();
    const plan = planBmiStructure({ bmi: converged(bmi, S6), settings: S6 });
    expect(plan.blockers).toEqual([]);
    expect(plan.actions).toEqual([]);
    expect(plan.requests).toEqual([]);
  });

  test("more checks: columns are inserted after the last group, copied, cleared and renamed", () => {
    const { bmi } = tabs();
    const plan = planBmiStructure({ bmi: converged(bmi, S6), settings: { ...S6, bmiPeriods: 8 }, lastGroupWidths: [90, 80, 80, 60, 90, 220] });
    expect(plan.blockers).toEqual([]);
    const req = plan.requests as Record<string, any>[];
    const insert = req.find((r) => r.insertDimension)!.insertDimension;
    expect(insert.range).toMatchObject({ dimension: "COLUMNS", startIndex: 45, endIndex: 57 });
    expect(insert.inheritFromBefore).toBe(true);
    const pastes = req.filter((r) => r.copyPaste && r.copyPaste.pasteType === "PASTE_NORMAL").map((r) => r.copyPaste);
    expect(pastes.map((p) => [p.source.startColumnIndex, p.destination.startColumnIndex])).toEqual([[39, 45], [39, 51]]);
    const cleared = req.filter((r) => r.repeatCell).map((r) => r.repeatCell.range);
    // Per new group: the three inputs, then the note.
    expect(cleared.map((r) => [r.startColumnIndex, r.endColumnIndex, r.startRowIndex])).toEqual([[45, 48, 5], [50, 51, 5], [51, 54, 5], [56, 57, 5]]);
    const merges = req.filter((r) => r.mergeCells).map((r) => r.mergeCells.range);
    expect(merges.map((r) => [r.startColumnIndex, r.endColumnIndex, r.startRowIndex, r.endRowIndex])).toEqual([[45, 51, 3, 4], [51, 57, 3, 4]]);
    // Widths copied to every new column.
    expect(req.filter((r) => r.updateDimensionProperties)).toHaveLength(12);
    // Headers of the new groups carry the label with the period.
    const texts = req.filter((r) => r.updateCells).map((r) => r.updateCells).flatMap((u) => u.rows[0].values.map((v: any) => v.userEnteredValue.stringValue ?? v.userEnteredValue.formulaValue));
    expect(texts).toContain("BMI Cek ke-7 (Periode 4-17 Jan 2027)");
    expect(texts).toContain("BMI Cek ke-8 (Periode 18-31 Jan 2027)");
    // Summary formulas cover the 8 groups (J..BE) and moved right by twelve columns.
    const formulaCells = req.filter((r) => r.updateCells && r.updateCells.rows[0].values[0].userEnteredValue.formulaValue);
    const count = formulaCells.find((r) => r.updateCells.range.startColumnIndex === 57)!;
    expect(count.updateCells.rows[0].values[0].userEnteredValue.formulaValue).toContain("$J6:$BE6");
    expect(plan.actions[0]).toBe("Tambah 2 kelompok kolom cek (BMI Cek ke-7 sampai ke-8).");
  });

  test("a bigger interval renames every group and rewrites nothing else", () => {
    const { bmi } = tabs();
    const plan = planBmiStructure({ bmi: converged(bmi, S6), settings: { ...S6, bmiIntervalDays: 7 } });
    const req = plan.requests as Record<string, any>[];
    expect(req).toHaveLength(6);
    expect(req.every((r) => r.updateCells)).toBe(true);
    const texts = req.map((r) => r.updateCells.rows[0].values[0].userEnteredValue.stringValue);
    expect(texts[0]).toBe("BMI Cek ke-1 (Periode 12-18 Oct 2026)");
    expect(texts[5]).toBe("BMI Cek ke-6 (Periode 16-22 Nov 2026)");
  });

  test("a new first check date renames the groups too", () => {
    const { bmi } = tabs();
    const plan = planBmiStructure({ bmi: converged(bmi, S6), settings: { ...S6, bmiFirstCheck: "2026-10-19" } });
    expect(plan.requests).toHaveLength(6);
    expect(plan.actions[0]).toContain("Perbarui judul 6 kelompok");
  });

  test("fewer checks: trailing groups are deleted when they hold no data", () => {
    const { bmi } = tabs();
    const base = converged(bmi, S6);
    for (let r = 6; r < base.values.length; r++) for (let c = 33; c < 45; c++) if (base.values[r]?.[c] !== undefined && !String(base.formulas[r]?.[c] ?? "").startsWith("=")) base.values[r][c] = "";
    const plan = planBmiStructure({ bmi: base, settings: { ...S6, bmiPeriods: 4 } });
    expect(plan.blockers).toEqual([]);
    const del = (plan.requests as Record<string, any>[]).find((r) => r.deleteDimension)!.deleteDimension;
    expect(del.range).toMatchObject({ dimension: "COLUMNS", startIndex: 33, endIndex: 45 });
    expect(plan.actions[0]).toBe("Hapus 2 kelompok kolom cek (BMI Cek ke-5 sampai ke-6).");
    // The summary block now ends at the fourth group (J..AG) and starts twelve columns to the left.
    const f = (plan.requests as Record<string, any>[]).filter((r) => r.updateCells && r.updateCells.rows[0].values[0].userEnteredValue.formulaValue);
    expect(f.find((r) => r.updateCells.range.startColumnIndex === 33)!.updateCells.rows[0].values[0].userEnteredValue.formulaValue).toContain("$J6:$AG6");
  });

  test("fewer checks are refused while a dropped group still holds data", () => {
    const { bmi } = tabs();
    const base = converged(bmi, S6);
    put(base, 7, FIRST + W * 5 + 1, 170); // height in group 6
    const plan = planBmiStructure({ bmi: base, settings: { ...S6, bmiPeriods: 5 } });
    expect(plan.requests).toEqual([]);
    expect(plan.blockers[0]).toContain("BMI Cek ke-6 masih berisi data");
  });

  test("the groups must be contiguous", () => {
    const { bmi } = tabs();
    put(bmi, 5, FIRST + W * 2, "");
    expect(planBmiStructure({ bmi, settings: S6 }).blockers[0]).toContain("tidak berurutan");
  });

  test("a missing summary column stops the change with a reason", () => {
    const { bmi } = tabs();
    put(bmi, 4, SUMMARY_FIRST + 1, "Tanggal Terakhir");
    const plan = planBmiStructure({ bmi, settings: S6 });
    expect(plan.requests).toEqual([]);
    expect(plan.blockers[0]).toContain("Tgl Cek Terakhir");
  });

  test("Program becomes Touch Point in column E, once", () => {
    const { bmi } = tabs();
    const base = converged(bmi, S6);
    put(base, 4, 4, "Program");
    const plan = planBmiStructure({ bmi: base, settings: S6 });
    const req = plan.requests as Record<string, any>[];
    expect(req[0].updateCells.rows[0].values[0].userEnteredValue.stringValue).toBe("Touch Point");
    expect(req[1].updateCells.rows[0].values[0].userEnteredValue.formulaValue).toBe(`=IF('Master SDM'!I5="","",'Master SDM'!I5)`);
    expect(req[2].copyPaste.pasteType).toBe("PASTE_FORMULA");
    expect(planBmiStructure({ bmi: converged(base, S6), settings: S6 }).requests).toEqual([]);
  });

  test("the old per-month sentences and Parameter labels are replaced", () => {
    const { bmi, parameter } = tabs();
    const base = converged(bmi, S6);
    put(base, 2, 0, "Isi sel kuning. Ada catatan → cek per 2 minggu; tanpa catatan → per bulan (cukup isi slot yang sesuai).");
    const row = parameter.values.findIndex((r) => String(r?.[1]).startsWith("Interval antar cek BMI"));
    put(parameter, row + 1, 1, "Interval cek BMI – ada catatan (hari)");
    const monthRow = parameter.values.findIndex((r) => String(r?.[1]).startsWith("Interval cek BMI – tanpa"));
    const petunjuk: RealTab = { title: "Petunjuk", sheetId: 7, rowCount: 50, columnCount: 5, values: [[], ["", "", "Cek BMI sesuai jadwal (kolom 'Cek Berikutnya' di Cek BMI 2 Mingguan): tiap 2 minggu untuk petugas dengan catatan BMI, tiap bulan untuk lainnya."]], formulas: [[], []] };
    const plan = planBmiStructure({ bmi: base, parameter, petunjuk, settings: { ...S6, bmiIntervalDays: 10 } });
    const strings = (plan.requests as Record<string, any>[]).map((r) => r.updateCells?.rows[0].values[0].userEnteredValue.stringValue).filter(Boolean);
    expect(strings.some((s: string) => s.includes("tiap 10 hari"))).toBe(true);
    expect(strings).toContain("Interval antar cek BMI (hari, semua petugas)");
    expect(strings).toContain("Cek BMI sesuai jadwal (kolom 'Cek Berikutnya' di Cek BMI 2 Mingguan): tiap 10 hari untuk semua petugas.");
    expect(monthRow).toBeGreaterThan(-1);
  });

  test("Laporan Mingguan: the slot of the week uses the interval and the new name", () => {
    const { bmi } = tabs();
    const laporan: RealTab = {
      title: "Laporan Mingguan", sheetId: 9, rowCount: 100, columnCount: 14,
      values: [[], [], [], [], [], ["", "Slot cek BMI terkait", 2, "Cek ke-2 (rencana 26/10/2026)"]],
      formulas: [[], [], [], [], [], ["", "Slot cek BMI terkait", "=MAX(1;MIN(Parameter!$C$10;INT((Parameter!$C$5+(C4-1)*7-Parameter!$C$7)/14)+1))", '="Cek ke-"&C6&" (rencana "&TEXT(Parameter!$C$7+14*(C6-1);"dd/mm/yyyy")&")"']],
    };
    const plan = planBmiStructure({ bmi: converged(bmi, S6), laporan, settings: S6 });
    const f = (plan.requests as Record<string, any>[]).map((r) => r.updateCells.rows[0].values[0].userEnteredValue.formulaValue);
    expect(f).toEqual([laporanSlotFormula(), laporanLabelFormula()]);
    expect(f[0]).toContain("/Parameter!$C$8)");
    // Already converted: nothing to do.
    const done = { ...laporan, formulas: [[], [], [], [], [], ["", "Slot cek BMI terkait", laporanSlotFormula(), laporanLabelFormula()]] };
    expect(planBmiStructure({ bmi: converged(bmi, S6), laporan: done, settings: S6 }).requests).toEqual([]);
  });
});

describe("summary formulas", () => {
  const cols = { count: 45, lastDate: 46, lastBmi: 47, lastCategory: 48, delta: 49, next: 50, status: 51, note: 52, reportBmi: 53, reportCategory: 54 };

  test("their size does not depend on the number of checks", () => {
    const six = summaryFormulas(9, 44, cols);
    const fiftyTwo = summaryFormulas(9, 9 + 6 * 52 - 1, cols);
    for (const key of Object.keys(six) as (keyof typeof six)[]) {
      expect(Math.abs(fiftyTwo[key].length - six[key].length)).toBeLessThan(8);
    }
    expect(six.lastBmi).toContain("$J6:$AS6");
    expect(fiftyTwo.lastBmi).toContain(`$J6:$${colLetter(9 + 6 * 52 - 1)}6`);
  });

  test("the next check adds the interval to the last check date, for everyone", () => {
    const f = summaryFormulas(9, 44, cols).next;
    expect(f).toBe('=IF($B6="","",IF($AU6="",Parameter!$C$7,$AU6+Parameter!$C$8))');
    expect(f).not.toContain("EDATE");
  });

  test("a formula is current when it covers the block it should", () => {
    const f = summaryFormulas(9, 44, cols);
    expect(isCurrent("count", f.count, 9, 44)).toBe(true);
    expect(isCurrent("count", f.count, 9, 49)).toBe(false);
    expect(isCurrent("next", '=IF(B6="";"";IF(I6="Tidak";EDATE(AU6;Parameter!$C$9);AU6+Parameter!$C$8))', 9, 44)).toBe(false);
  });

  test("the Laporan label spells the month in English and handles a period that crosses months", () => {
    const f = laporanLabelFormula();
    expect(f).toContain('CHOOSE(MONTH(');
    expect(f).toContain('"Oct"');
    expect(f).toContain("YEAR(");
  });
});

describe("Komitmen/Target column", () => {
  const legacy = () => tabs(false).bmi;

  test("a tab with five-column groups only gets the sixth column, nothing else", () => {
    const plan = planBmiStructure({ bmi: legacy(), settings: S6 });
    expect(plan.blockers).toEqual([]);
    expect(plan.actions).toEqual(["Tambah kolom Komitmen/Target di setiap kelompok cek (6 kelompok)."]);
    const req = plan.requests as Record<string, any>[];
    const inserts = req.filter((r) => r.insertDimension).map((r) => r.insertDimension.range);
    // From the last group to the first: the column right after each Kategori of the five-column groups.
    expect(inserts.map((r) => [r.startIndex, r.endIndex])).toEqual([[39, 40], [34, 35], [29, 30], [24, 25], [19, 20], [14, 15]]);
    expect(inserts).toHaveLength(6);
    expect(req.filter((r) => r.insertDimension).every((r) => r.insertDimension.inheritFromBefore)).toBe(true);
    // Every group's merged title is widened by one column.
    const merges = req.filter((r) => r.mergeCells).map((r) => r.mergeCells.range);
    expect(merges.map((m) => m.endColumnIndex - m.startColumnIndex)).toEqual([6, 6, 6, 6, 6, 6]);
    // The header is written in row 5 of each new column.
    const headers = req.filter((r) => r.updateCells).map((r) => r.updateCells);
    expect(headers).toHaveLength(6);
    expect(headers.every((u) => u.range.startRowIndex === 4 && u.rows[0].values[0].userEnteredValue.stringValue === "Komitmen/Target")).toBe(true);
    // No formula is rewritten: Sheets moves the references by itself.
    expect(req.some((r) => r.updateCells && r.updateCells.rows[0].values[0].userEnteredValue.formulaValue)).toBe(false);
  });

  test("the first group's column is the last request in the batch and the later groups come first", () => {
    const plan = planCommitmentColumns(legacy());
    const starts = (plan.requests as Record<string, any>[]).filter((r) => r.insertDimension).map((r) => r.insertDimension.range.startIndex);
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
  });

  test("a tab that already has the column needs nothing for it", () => {
    expect(planCommitmentColumns(tabs().bmi).requests).toEqual([]);
  });

  test("a group missing the column among groups that have it is refused", () => {
    const { bmi } = tabs();
    put(bmi, 5, FIRST + W * 3 + 5, "");
    const plan = planBmiStructure({ bmi, settings: S6 });
    expect(plan.requests).toEqual([]);
    expect(plan.blockers[0]).toContain("Komitmen/Target");
  });

  test("more checks copy the six columns and clear the note too", () => {
    const { bmi } = tabs();
    const plan = planBmiStructure({ bmi: converged(bmi, S6), settings: { ...S6, bmiPeriods: 7 } });
    const cleared = (plan.requests as Record<string, any>[]).filter((r) => r.repeatCell).map((r) => r.repeatCell.range);
    expect(cleared.map((r) => [r.startColumnIndex, r.endColumnIndex])).toEqual([[45, 48], [50, 51]]);
  });
});

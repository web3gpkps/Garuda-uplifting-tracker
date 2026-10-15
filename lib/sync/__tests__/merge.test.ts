/**
 * Merge engine on plain row-1 tabs (rowOneSpecs). Workbook layouts are covered in layouts.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { countPlan, isPlanEmpty, merge, mergeCell } from "../merge";
import { rowOneSpecs, specFor } from "../tables";
import { World } from "../testing/fakes";
import { actionRow, manyStaff, remedialRow, replacementRow, settingsRow, smallDb, staffRow, weeklyRow } from "../testing/fixtures";
import type { Plan, SyncTable, TableSpec } from "../types";

// ------------------------------------------------------------------ helpers

const SDM = "Master SDM";
const LOG = "Log Performa Mingguan";
const BMI = "Cek BMI 2 Mingguan";
const TL = "Tindak Lanjut";
const PG = "Penggantian SDM";
const REM = "Remedial";
const PAR = "Parameter";
const TM = "Temuan Mingguan";

/** What a plan still wants to do, for readable failures. */
function pending(plan: Plan): string[] {
  const out: string[] = [];
  for (const t of plan.tables) {
    const c = countPlan(plan)[t.table];
    const parts = Object.entries(c).filter(([k, v]) => v && k !== "openIssues");
    if (parts.length || t.sheet.notes.length) {
      out.push(`${t.table}: ${JSON.stringify(Object.fromEntries(parts))} notes=${t.sheet.notes.length}`);
    }
  }
  return out;
}

function expectSteady(w: World) {
  const p = w.plan();
  expect(pending(p)).toEqual([]);
  expect(isPlanEmpty(p)).toBe(true);
}

function seeded(db = smallDb(), specs?: TableSpec[]): World {
  const w = new World(db, specs);
  w.sync();
  expectSteady(w);
  return w;
}

/** 1-based sheet row of the first data row whose `header` equals `value`. */
function rowOf(w: World, tab: string, header: string, value: unknown): number {
  const i = w.sheet.rows(tab).findIndex((r) => r[header] === value);
  if (i < 0) throw new Error(`no row with ${header}=${String(value)} in ${tab}`);
  return i + 2;
}

function tableValues(table: SyncTable, rows: Record<string, unknown>[]): unknown[][] {
  const header = specFor(table).columns.map((c) => c.header);
  return [header, ...rows.map((r) => header.map((h) => r[h] ?? ""))];
}

const tp = (plan: Plan, table: SyncTable) => plan.tables.find((t) => t.table === table)!;
const staff = (w: World, code: string) => w.db.find("staff", { code })!;
const withSpec = (table: SyncTable, patch: Partial<TableSpec>) =>
  rowOneSpecs().map((s) => (s.table === table ? { ...s, ...patch } : s));

// ------------------------------------------------------------------ mergeCell

describe("mergeCell (3-way, per cell)", () => {
  const cases: [string, number | undefined, number | null, number | null, string, number | null, boolean][] = [
    // name, base, sheet, db, policy, value, conflict
    ["nothing changed", 4, 4, 4, "db-wins", 4, false],
    ["only sheet changed", 4, 5, 4, "db-wins", 5, false],
    ["only db changed", 4, 4, 2, "db-wins", 2, false],
    ["both changed to the same value", 4, 5, 5, "db-wins", 5, false],
    ["both changed differently, db-wins", 4, 5, 2, "db-wins", 2, true],
    ["both changed differently, sheet-wins", 4, 5, 2, "sheet-wins", 5, true],
    ["sheet cleared, db unchanged", 4, null, 4, "db-wins", null, false],
    ["no baseline, sheet empty: db fills", undefined, null, 3, "db-wins", 3, false],
    ["no baseline, db empty: sheet fills", undefined, 3, null, "db-wins", 3, false],
    ["no baseline, both set differently, db-wins", undefined, 3, 5, "db-wins", 5, true],
    ["no baseline, both set differently, sheet-wins", undefined, 3, 5, "sheet-wins", 3, true],
  ];
  for (const [name, b, s, d, policy, value, conflict] of cases) {
    test(name, () => {
      const r = mergeCell(b, s, d, policy as "db-wins" | "sheet-wins");
      expect(r.value).toBe(value);
      expect(r.conflict).toBe(conflict);
    });
  }
  test("direction flags", () => {
    expect(mergeCell(4, 5, 4, "db-wins")).toMatchObject({ toDb: true, toSheet: false });
    expect(mergeCell(4, 4, 5, "db-wins")).toMatchObject({ toDb: false, toSheet: true });
    expect(mergeCell(4, 5, 2, "db-wins")).toMatchObject({ toDb: false, toSheet: true });
    expect(mergeCell(4, 5, 2, "sheet-wins")).toMatchObject({ toDb: true, toSheet: false });
  });
});

// ------------------------------------------------------------------ first run

describe("first run (empty baseline)", () => {
  test("sheet empty, DB has data: tabs created and filled from DB, nothing written to DB", () => {
    const w = new World(smallDb());
    const plan = w.sync();
    for (const t of plan.tables) {
      expect(t.sheet.create).toBe(true);
      expect(t.db).toEqual({ inserts: [], updates: [], deletes: [], pending: [] });
      expect(t.conflicts).toEqual([]);
    }
    expect(tp(plan, "settings").sheet.appends.length).toBe(19);
    expect(w.sheet.rows(SDM).map((r) => r["ID SDM"]).sort()).toEqual(["DPS-01", "SUB-01", "SUB-02"]);
    expect(w.sheet.rows(LOG).length).toBe(2);
    expect(w.sheet.rows(PG)[0]["ID Sistem"]).toBe(1);
    expectSteady(w);
  });

  test("both sides already have data: union, nulls filled, differing cells resolved db-wins and logged, no deletes", () => {
    const w = new World(smallDb());
    const base = { Program: "IULS", Provider: "Gapura", Unit: "SUB", "Touch Point": "Check-in Counter", "Role Play": 80, "Post-Test": 90, "Remark di Laporan": "Passed", "Status Penugasan": "Aktif" };
    const failed = { "Role Play": 60, "Remark di Laporan": "Failed", "Status Penugasan": "Remedial" };
    w.sheet.addTab(
      SDM,
      tableValues("staff", [
        // Same as DB except: Employee Number empty (DB fills it), notes set (DB takes it).
        { ...base, "ID SDM": "SUB-01", "Nama Petugas": "Petugas SUB-01", Catatan: "dari sheet" },
        // Name differs: conflict.
        { ...base, ...failed, "ID SDM": "SUB-02", "Nama Petugas": "Nama Versi Sheet", "Employee Number": "1002" },
        // Only in the sheet.
        { "ID SDM": "KNO-01", Unit: "KNO", "Nama Petugas": "Petugas KNO-01", "Status Penugasan": "Aktif" },
      ]),
    );
    const plan = w.sync();
    const s = tp(plan, "staff");
    expect(s.db.inserts.map((r) => r.code)).toEqual(["KNO-01"]);
    expect(s.db.updates).toEqual([{ key: { code: "SUB-01" }, set: { notes: "dari sheet" } }]);
    expect(s.db.deletes).toEqual([]);
    expect(s.conflicts).toEqual([
      { table: "staff", rowKey: "SUB-02", column: "name", baseline: null, sheet: "Nama Versi Sheet", db: "Petugas SUB-02", resolution: "db-wins" },
    ]);
    expect(w.sheet.cell(SDM, rowOf(w, SDM, "ID SDM", "SUB-02"), "Nama Petugas")).toBe("Petugas SUB-02");
    expect(w.sheet.cell(SDM, rowOf(w, SDM, "ID SDM", "SUB-01"), "Employee Number")).toBe("1001");
    expect(w.sheet.rows(SDM).map((r) => r["ID SDM"]).sort()).toEqual(["DPS-01", "KNO-01", "SUB-01", "SUB-02"]);
    expect(w.db.rows("staff").length).toBe(4);
    expectSteady(w);
  });

  test("both sides have data, sheet-wins: the sheet value is written to the DB and logged", () => {
    const w = new World(smallDb());
    w.sheet.addTab(TM, tableValues("weekly_reports", [{ "Minggu Ke": 1, Lingkup: "SUB", Temuan: "Versi sheet" }]));
    const plan = w.sync({ conflictPolicy: "sheet-wins" });
    expect(tp(plan, "weekly_reports").conflicts[0]).toMatchObject({ rowKey: "1|SUB", column: "findings", resolution: "sheet-wins", db: "Temuan minggu 1" });
    expect(w.db.find("weekly_reports", { week: 1, scope: "SUB" })!.findings).toBe("Versi sheet");
    expect(w.sheet.rows(TM).map((r) => r.Lingkup)).toEqual(["SUB", "KPS"]);
    expectSteady(w);
  });
});

// ------------------------------------------------------------------ cell changes

describe("cell changes against the baseline", () => {
  test("only the sheet changed: DB updated", () => {
    const w = seeded();
    w.sheet.setCell(SDM, rowOf(w, SDM, "ID SDM", "SUB-01"), "Role Play", 95);
    const plan = w.sync();
    expect(tp(plan, "staff").db.updates).toEqual([{ key: { code: "SUB-01" }, set: { role_play: 95 } }]);
    expect(staff(w, "SUB-01").role_play).toBe(95);
    expect(w.baseline!.tables.staff!["SUB-01"].role_play).toBe(95);
    expectSteady(w);
  });

  test("only the DB changed: sheet cell updated", () => {
    const w = seeded();
    staff(w, "SUB-02").employee_no = "9999";
    const plan = w.sync();
    expect(tp(plan, "staff").db.updates).toEqual([]);
    expect(w.sheet.cell(SDM, rowOf(w, SDM, "ID SDM", "SUB-02"), "Employee Number")).toBe("9999");
    expectSteady(w);
  });

  test("both changed to the same value: nothing written, no conflict", () => {
    const w = seeded();
    staff(w, "SUB-01").notes = "sama";
    w.sheet.setCell(SDM, rowOf(w, SDM, "ID SDM", "SUB-01"), "Catatan", "sama");
    const plan = w.sync();
    expect(pending(plan)).toEqual([]);
    expect(w.baseline!.tables.staff!["SUB-01"].notes).toBe("sama");
  });

  test("both changed differently: db-wins by default, DB value written over the sheet, conflict logged", () => {
    const w = seeded();
    const r = rowOf(w, SDM, "ID SDM", "SUB-01");
    staff(w, "SUB-01").role_play = 95;
    w.sheet.setCell(SDM, r, "Role Play", 70);
    const plan = w.sync();
    expect(tp(plan, "staff").conflicts).toEqual([
      { table: "staff", rowKey: "SUB-01", column: "role_play", baseline: 80, sheet: 70, db: 95, resolution: "db-wins" },
    ]);
    expect(tp(plan, "staff").db.updates).toEqual([]);
    expect(w.sheet.cell(SDM, r, "Role Play")).toBe(95);
    expect(staff(w, "SUB-01").role_play).toBe(95);
    expectSteady(w);
  });

  test("both changed differently with sheet-wins: sheet value written to DB, conflict logged", () => {
    const w = seeded();
    const r = rowOf(w, SDM, "ID SDM", "SUB-01");
    staff(w, "SUB-01").role_play = 95;
    w.sheet.setCell(SDM, r, "Role Play", 70);
    const plan = w.sync({ conflictPolicy: "sheet-wins" });
    expect(tp(plan, "staff").conflicts[0]).toMatchObject({ column: "role_play", sheet: 70, db: 95, resolution: "sheet-wins" });
    expect(staff(w, "SUB-01").role_play).toBe(70);
    expect(w.sheet.cell(SDM, r, "Role Play")).toBe(70);
    expectSteady(w);
  });

  test("independent edits to different cells of one row both apply", () => {
    const w = seeded();
    const r = rowOf(w, SDM, "ID SDM", "SUB-01");
    w.sheet.setCell(SDM, r, "Catatan", "dari sheet");
    staff(w, "SUB-01").bmi_note = "dari web";
    w.sync();
    expect(staff(w, "SUB-01").notes).toBe("dari sheet");
    expect(w.sheet.cell(SDM, r, "Catatan Program Kebugaran")).toBe("dari web");
    expectSteady(w);
  });
});

// ------------------------------------------------------------------ inserts and deletes

describe("row inserts and deletes", () => {
  test("new sheet row is inserted into the DB; empty required column gets the DB default written back", () => {
    const w = seeded();
    const n = w.sheet.rows(SDM).length + 2;
    w.sheet.setCell(SDM, n, "ID SDM", "TMB-01");
    w.sheet.setCell(SDM, n, "Unit", "SUB");
    w.sheet.setCell(SDM, n, "Nama Petugas", "Petugas Tambahan");
    const plan = w.sync();
    expect(tp(plan, "staff").db.inserts).toHaveLength(1);
    expect(staff(w, "TMB-01")).toMatchObject({ station: "SUB", name: "Petugas Tambahan", assignment_status: "Aktif" });
    expect(w.sheet.cell(SDM, n, "Status Penugasan")).toBe("Aktif");
    expectSteady(w);
  });

  test("new DB row is appended to the sheet", () => {
    const w = seeded();
    w.db.rows("action_items").push(actionRow("GA-TL03", 3));
    const plan = w.sync();
    expect(tp(plan, "action_items").sheet.appends).toHaveLength(1);
    expect(w.sheet.rows(TL).map((r) => r.ID)).toEqual(["GA-TL01", "GA-TL02", "GA-TL03"]);
    expectSteady(w);
  });

  test("row deleted in the sheet is deleted in the DB (children cascade and leave the sheet)", () => {
    const w = seeded();
    w.sheet.tabs.get(SDM)!.values.splice(rowOf(w, SDM, "ID SDM", "SUB-01") - 1, 1);
    const plan = w.sync();
    expect(tp(plan, "staff").db.deletes).toEqual([{ code: "SUB-01" }]);
    expect(tp(plan, "weekly_scores").sheet.deleteRows).toEqual([2]);
    expect(tp(plan, "bmi_checks").sheet.deleteRows).toEqual([2]);
    expect(staff(w, "SUB-01")).toBeUndefined();
    expect(w.db.rows("weekly_scores").map((r) => r.staff_code)).toEqual(["SUB-02"]);
    expect(w.sheet.rows(LOG).map((r) => r["ID SDM"])).toEqual(["SUB-02"]);
    expect(w.sheet.rows(BMI)).toEqual([]);
    expectSteady(w);
  });

  test("clearing a staff member's name counts as removing the record (no name = absent)", () => {
    const w = seeded();
    w.sheet.setCell(SDM, rowOf(w, SDM, "ID SDM", "DPS-01"), "Nama Petugas", "");
    const plan = w.sync();
    expect(tp(plan, "staff").db.deletes).toEqual([{ code: "DPS-01" }]);
    expectSteady(w);
  });

  test("row deleted in the DB clears that record's input cells in the sheet (key kept)", () => {
    const w = seeded();
    const r = rowOf(w, TL, "ID", "GA-TL01");
    w.db.tables.set("action_items", w.db.rows("action_items").filter((x) => x.code !== "GA-TL01"));
    const plan = w.sync();
    expect(tp(plan, "action_items").sheet.deleteRows).toEqual([]);
    expect(w.sheet.cell(TL, r, "ID")).toBe("GA-TL01");
    expect(w.sheet.cell(TL, r, "Status")).toBe("");
    expectSteady(w);
  });

  test("deleted on both sides: dropped from the baseline, nothing written", () => {
    const w = seeded();
    w.db.tables.set("action_items", w.db.rows("action_items").filter((r) => r.code !== "GA-TL02"));
    w.sheet.tabs.get(TL)!.values.splice(rowOf(w, TL, "ID", "GA-TL02") - 1, 1);
    const plan = w.sync();
    expect(pending(plan)).toEqual([]);
    expect(w.baseline!.tables.action_items!["GA-TL02"]).toBeUndefined();
  });
});

describe("delete vs edit races (whole-row conflicts)", () => {
  function sheetDeletedDbEdited(policy?: "db-wins" | "sheet-wins") {
    const w = seeded();
    w.sheet.tabs.get(TL)!.values.splice(rowOf(w, TL, "ID", "GA-TL01") - 1, 1);
    w.db.find("action_items", { code: "GA-TL01" })!.status = "On Progress";
    return { w, plan: w.sync({ conflictPolicy: policy }) };
  }
  function dbDeletedSheetEdited(policy?: "db-wins" | "sheet-wins") {
    const w = seeded();
    w.sheet.setCell(TL, rowOf(w, TL, "ID", "GA-TL01"), "Status", "Selesai");
    w.db.tables.set("action_items", w.db.rows("action_items").filter((r) => r.code !== "GA-TL01"));
    return { w, plan: w.sync({ conflictPolicy: policy }) };
  }

  test("sheet deleted, DB edited, db-wins: row restored to the sheet", () => {
    const { w, plan } = sheetDeletedDbEdited();
    const c = tp(plan, "action_items").conflicts;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ rowKey: "GA-TL01", column: null, sheet: null, resolution: "db-wins" });
    expect(tp(plan, "action_items").db.deletes).toEqual([]);
    expect(w.sheet.rows(TL).find((r) => r.ID === "GA-TL01")!.Status).toBe("On Progress");
    expectSteady(w);
  });

  test("sheet deleted, DB edited, sheet-wins: DB row deleted", () => {
    const { w, plan } = sheetDeletedDbEdited("sheet-wins");
    expect(tp(plan, "action_items").conflicts[0]).toMatchObject({ column: null, resolution: "sheet-wins" });
    expect(w.db.find("action_items", { code: "GA-TL01" })).toBeUndefined();
    expectSteady(w);
  });

  test("DB deleted, sheet edited, db-wins: the sheet record is cleared", () => {
    const { w, plan } = dbDeletedSheetEdited();
    expect(tp(plan, "action_items").conflicts[0]).toMatchObject({ column: null, db: null, resolution: "db-wins" });
    expect(w.sheet.rows(TL).find((r) => r.ID === "GA-TL01")!.Status).toBe("");
    expectSteady(w);
  });

  test("DB deleted, sheet edited, sheet-wins: row re-inserted into the DB", () => {
    const { w, plan } = dbDeletedSheetEdited("sheet-wins");
    expect(tp(plan, "action_items").conflicts[0]).toMatchObject({ column: null, resolution: "sheet-wins" });
    expect(w.db.find("action_items", { code: "GA-TL01" })!.status).toBe("Selesai");
    expectSteady(w);
  });
});

// ------------------------------------------------------------------ deletion guard

describe("deletion guard: max(10 rows, 50%)", () => {
  const bigDb = (n: number) => ({ ...smallDb(), staff: manyStaff(n), weekly_scores: [], bmi_checks: [] });
  const dropSheetRows = (w: World, tab: string, count: number) => w.sheet.tabs.get(tab)!.values.splice(1, count);

  test("clearing many sheet rows skips the DB deletes and logs once", () => {
    const w = seeded(bigDb(30));
    dropSheetRows(w, SDM, 16);
    const plan = w.sync();
    const s = tp(plan, "staff");
    expect(s.db.deletes).toEqual([]);
    expect(s.issues.filter((i) => i.kind === "deletes_skipped").map((i) => i.isNew)).toEqual([true]);
    expect(w.db.rows("staff")).toHaveLength(30);
    expect(Object.keys(w.baseline!.tables.staff!)).toHaveLength(30);
    const again = w.sync();
    expect(tp(again, "staff").issues.filter((i) => i.kind === "deletes_skipped").map((i) => i.isNew)).toEqual([false]);
    expect(pending(again)).toEqual([]);
  });

  test("allowMassDelete lifts the guard for that table", () => {
    const w = seeded(bigDb(30));
    dropSheetRows(w, SDM, 16);
    w.sync();
    w.sync({ allowMassDelete: ["staff"] });
    expect(w.db.rows("staff")).toHaveLength(14);
    expectSteady(w);
  });

  test("up to 10 rows (or half the table) is allowed", () => {
    const w = seeded(bigDb(20));
    dropSheetRows(w, SDM, 10);
    w.sync();
    expect(w.db.rows("staff")).toHaveLength(10);
    expectSteady(w);
  });

  test("threshold is 50% for big tables: 50 of 100 allowed, 51 of 100 held back", () => {
    const w = seeded(bigDb(100));
    dropSheetRows(w, SDM, 50);
    w.sync();
    expect(w.db.rows("staff")).toHaveLength(50);
    const w2 = seeded(bigDb(100));
    dropSheetRows(w2, SDM, 51);
    w2.sync();
    expect(w2.db.rows("staff")).toHaveLength(100);
  });

  test("DB-side mass delete skips the sheet deletes", () => {
    const w = seeded(bigDb(30));
    w.db.tables.set("staff", w.db.rows("staff").slice(16));
    const plan = w.sync();
    expect(tp(plan, "staff").sheet.updates).toEqual([]);
    expect(w.sheet.rows(SDM).every((r) => r["Nama Petugas"] !== "")).toBe(true);
    expect(tp(plan, "staff").issues.some((i) => i.kind === "deletes_skipped" && i.column === "sheet")).toBe(true);
  });
});

// ------------------------------------------------------------------ validation

describe("invalid sheet values", () => {
  test("role play 150: not written, noted, baseline unchanged; fixed value syncs and note clears", () => {
    const w = seeded();
    const r = rowOf(w, SDM, "ID SDM", "SUB-01");
    w.sheet.setCell(SDM, r, "Role Play", 150);
    const plan = w.sync();
    const s = tp(plan, "staff");
    expect(s.db.updates).toEqual([]);
    expect(s.issues).toHaveLength(1);
    expect(s.issues[0]).toMatchObject({ kind: "invalid_value", rowKey: "SUB-01", column: "role_play", sheetValue: 150, isNew: true });
    expect(w.sheet.note(SDM, r, "Role Play")).toContain("Di luar rentang 0–100");
    expect(w.sheet.note(SDM, r, "Role Play")).toStartWith("Garuda sync:");
    expect(staff(w, "SUB-01").role_play).toBe(80);
    expect(w.baseline!.tables.staff!["SUB-01"].role_play).toBe(80);
    expectSteady(w);

    w.sheet.setCell(SDM, r, "Role Play", 95);
    w.sync();
    expect(staff(w, "SUB-01").role_play).toBe(95);
    expect(w.sheet.note(SDM, r, "Role Play")).toBeUndefined();
    expectSteady(w);
  });

  test("height 300 is rejected; DB keeps its value", () => {
    const w = seeded();
    const r = rowOf(w, BMI, "ID SDM", "SUB-01");
    w.sheet.setCell(BMI, r, "Tinggi (cm)", 300);
    const plan = w.sync();
    expect(tp(plan, "bmi_checks").db.updates).toEqual([]);
    expect(tp(plan, "bmi_checks").issues[0]).toMatchObject({ kind: "invalid_value", column: "height_cm" });
    expect(w.db.find("bmi_checks", { staff_code: "SUB-01", period: 1 })!.height_cm).toBe(170);
    expect(w.sheet.cell(BMI, r, "Tinggi (cm)")).toBe(300);
    expectSteady(w);
  });

  test("an invalid sheet value never wins: if the DB changed meanwhile its value replaces the cell", () => {
    const w = seeded();
    const r = rowOf(w, SDM, "ID SDM", "SUB-01");
    w.sheet.setCell(SDM, r, "Role Play", 150);
    w.sync();
    staff(w, "SUB-01").role_play = 70;
    const plan = w.sync({ conflictPolicy: "sheet-wins" });
    expect(tp(plan, "staff").conflicts).toEqual([]);
    expect(w.sheet.cell(SDM, r, "Role Play")).toBe(70);
    expect(w.sheet.note(SDM, r, "Role Play")).toBeUndefined();
    expectSteady(w);
  });

  test("clearing a required cell keeps the DB value and notes the cell", () => {
    const w = seeded();
    const r = rowOf(w, SDM, "ID SDM", "SUB-02");
    w.sheet.setCell(SDM, r, "Unit", "");
    const plan = w.sync();
    expect(tp(plan, "staff").db.updates).toEqual([]);
    expect(tp(plan, "staff").issues[0]).toMatchObject({ kind: "required_missing", column: "station" });
    expect(w.sheet.note(SDM, r, "Unit")).toContain("wajib diisi");
    expectSteady(w);
  });

  test("a blank required cell that has a default means the default: no issue, no write", () => {
    const w = seeded();
    staff(w, "SUB-02").assignment_status = "Aktif";
    w.sync();
    const r = rowOf(w, SDM, "ID SDM", "SUB-02");
    w.sheet.setCell(SDM, r, "Status Penugasan", "");
    const plan = w.sync();
    expect(tp(plan, "staff").issues).toEqual([]);
    expect(tp(plan, "staff").db.updates).toEqual([]);
    expect(w.sheet.cell(SDM, r, "Status Penugasan")).toBe("");
    expect(w.sheet.note(SDM, r, "Status Penugasan")).toBeUndefined();
    expectSteady(w);
  });

  test("a DB change wins over a blank (default) Status Penugasan cell and is written to it", () => {
    const w = seeded();
    staff(w, "SUB-02").assignment_status = "Aktif";
    w.sync();
    const r = rowOf(w, SDM, "ID SDM", "SUB-02");
    w.sheet.setCell(SDM, r, "Status Penugasan", "");
    w.sync();
    staff(w, "SUB-02").assignment_status = "Remedial";
    const plan = w.sync();
    expect(tp(plan, "staff").conflicts).toEqual([]);
    expect(w.sheet.cell(SDM, r, "Status Penugasan")).toBe("Remedial");
    expectSteady(w);
  });

  test("a new row with an invalid value is not inserted until fixed", () => {
    const w = seeded();
    const n = w.sheet.rows(BMI).length + 2;
    w.sheet.setCell(BMI, n, "ID SDM", "SUB-02");
    w.sheet.setCell(BMI, n, "Cek Ke", 1);
    w.sheet.setCell(BMI, n, "Tinggi (cm)", 168);
    w.sheet.setCell(BMI, n, "Berat (kg)", "berat");
    let plan = w.sync();
    expect(tp(plan, "bmi_checks").db.inserts).toEqual([]);
    expect(w.sheet.note(BMI, n, "Berat (kg)")).toBeDefined();
    w.sheet.setCell(BMI, n, "Berat (kg)", "58,5");
    plan = w.sync();
    expect(w.db.find("bmi_checks", { staff_code: "SUB-02", period: 1 })).toMatchObject({ height_cm: 168, weight_kg: 58.5 });
    expect(w.sheet.note(BMI, n, "Berat (kg)")).toBeUndefined();
    expectSteady(w);
  });

  test("BMI: height without weight is rejected; a date alone is an incomplete row", () => {
    const w = seeded();
    const n = w.sheet.rows(BMI).length + 2;
    w.sheet.setCell(BMI, n, "ID SDM", "SUB-02");
    w.sheet.setCell(BMI, n, "Cek Ke", 2);
    w.sheet.setCell(BMI, n, "Tinggi (cm)", 168);
    w.sheet.setCell(BMI, n + 1, "ID SDM", "SUB-02");
    w.sheet.setCell(BMI, n + 1, "Cek Ke", 3);
    w.sheet.setCell(BMI, n + 1, "Tgl Cek", "09/11/2026");
    const plan = w.sync();
    const t = tp(plan, "bmi_checks");
    expect(t.db.inserts).toEqual([]);
    expect(t.issues.map((i) => `${i.kind}:${i.column}`).sort()).toEqual(["incomplete_row:height_cm", "required_missing:weight_kg"]);
    expect(w.sheet.note(BMI, n + 1, "Tinggi (cm)")).toContain("Baris belum lengkap");
  });

  test("enum values match case-insensitively; unknown values are rejected", () => {
    const w = seeded();
    const r = rowOf(w, TL, "ID", "GA-TL01");
    w.sheet.setCell(TL, r, "Status", "selesai");
    w.sheet.setCell(TL, r, "Jenis", "Kadang");
    const plan = w.sync();
    expect(tp(plan, "action_items").db.updates).toEqual([{ key: { code: "GA-TL01" }, set: { status: "Selesai" } }]);
    expect(tp(plan, "action_items").issues.map((i) => i.column)).toEqual(["kind"]);
  });

  test("Log row for an unknown staff code is not inserted", () => {
    const w = seeded();
    const n = w.sheet.rows(LOG).length + 2;
    w.sheet.setCell(LOG, n, "ID SDM", "XXX-99");
    w.sheet.setCell(LOG, n, "Minggu Ke", 2);
    w.sheet.setCell(LOG, n, "A Grooming & Appearance", 70);
    const plan = w.sync();
    expect(tp(plan, "weekly_scores").db.inserts).toEqual([]);
    expect(tp(plan, "weekly_scores").issues[0]).toMatchObject({ kind: "unknown_parent", column: "staff_code" });
    expectSteady(w);
  });

  test("a row whose key cell is empty is reported, not synced", () => {
    const w = seeded();
    const n = w.sheet.rows(TL).length + 2;
    w.sheet.setCell(TL, n, "Tindakan / Inisiatif", "Tanpa ID");
    const plan = w.sync();
    expect(tp(plan, "action_items").db.inserts).toEqual([]);
    expect(tp(plan, "action_items").issues[0]).toMatchObject({ kind: "missing_key", column: "code" });
  });
});

// ------------------------------------------------------------------ formula cells, placement, clearing

describe("layout rules in the engine", () => {
  test("a locked (formula) cell is never read as input nor written; the DB value stands", () => {
    const w = seeded();
    const r = rowOf(w, TL, "ID", "GA-TL01");
    w.sheet.lock(TL, r, "Batas Waktu");
    w.sheet.setCell(TL, r, "Batas Waktu", 46400); // a recalculated formula value
    w.db.find("action_items", { code: "GA-TL01" })!.due_date = "2026-11-30";
    const plan = w.sync();
    expect(tp(plan, "action_items").db.updates).toEqual([]);
    expect(tp(plan, "action_items").sheet.updates).toEqual([]);
    expect(w.baseline!.tables.action_items!["GA-TL01"].due_date).toBe("2026-11-30");
    expectSteady(w);
  });

  test("appendMode none: a DB row without a sheet row is reported once, never placed or deleted", () => {
    const w = seeded();
    w.specs = withSpec("staff", { appendMode: "none", noRowMessage: "Master SDM penuh" });
    w.db.rows("staff").push(staffRow("TMB-09", 9));
    let plan = w.sync();
    const s = tp(plan, "staff");
    expect(s.sheet.appends).toEqual([]);
    expect(s.issues[0]).toMatchObject({ kind: "no_sheet_row", rowKey: "TMB-09", isNew: true, message: "Master SDM penuh" });
    expect(w.baseline!.tables.staff!["TMB-09"]).toBeUndefined();
    plan = w.sync();
    expect(tp(plan, "staff").issues[0].isNew).toBe(false);
    expect(tp(plan, "staff").db.deletes).toEqual([]);
    expect(staff(w, "TMB-09")).toBeDefined();
  });

  test("deleteMode clear: deleting never removes rows, a generated id is cleared too", () => {
    const specs = withSpec("replacements", { deleteMode: "clear" });
    const w = seeded(smallDb(), specs);
    w.db.tables.set("replacements", []);
    const plan = w.sync();
    const t = tp(plan, "replacements");
    expect(t.sheet.deleteRows).toEqual([]);
    expect(t.sheet.updates.map((u) => [u.row, u.value])).toContainEqual([2, null]);
    expect(t.sheet.updates.some((u) => u.col === 0 && u.value === null)).toBe(true); // ID Sistem cleared
    expect(w.sheet.cell(PG, 2, "ID Sistem")).toBe("");
    expect(w.sheet.cell(PG, 2, "Nama SDM Diganti")).toBe("");
    expectSteady(w);
  });
});

// ------------------------------------------------------------------ headers and tabs

describe("header and tab problems", () => {
  test("renamed header: hard error for that table only, nothing touched, other tables still sync", () => {
    const w = seeded();
    const col = w.sheet.tabs.get(SDM)!.values[0].indexOf("Nama Petugas");
    w.sheet.tabs.get(SDM)!.values[0][col] = "Nama";
    staff(w, "SUB-01").notes = "dari web";
    w.sheet.setCell(TL, rowOf(w, TL, "ID", "GA-TL01"), "PIC", "PIC Baru");
    const before = JSON.stringify(w.sheet.tabs.get(SDM)!.values);
    const plan = w.sync();
    const s = tp(plan, "staff");
    expect(s.error).toContain('"Nama Petugas"');
    expect(s.db).toEqual({ inserts: [], updates: [], deletes: [], pending: [] });
    expect(s.sheet.updates).toEqual([]);
    expect(JSON.stringify(w.sheet.tabs.get(SDM)!.values)).toBe(before);
    expect(w.db.find("action_items", { code: "GA-TL01" })!.pic).toBe("PIC Baru");
    expect(tp(plan, "weekly_scores").error).toBeNull();

    w.sheet.tabs.get(SDM)!.values[0][col] = "Nama Petugas";
    w.sync();
    expect(w.sheet.cell(SDM, rowOf(w, SDM, "ID SDM", "SUB-01"), "Catatan")).toBe("dari web");
    expectSteady(w);
  });

  test("missing column and duplicate column are hard errors", () => {
    const w = seeded();
    for (const row of w.sheet.tabs.get(TL)!.values) row.splice(3, 1); // drop "Akar Masalah / Temuan"
    expect(tp(w.plan(), "action_items").error).toContain('"Akar Masalah / Temuan"');

    const w2 = seeded();
    w2.sheet.tabs.get(TM)!.values[0].push("Minggu Ke");
    expect(tp(w2.plan(), "weekly_reports").error).toContain("kolom ganda");
  });

  test("a layout error from the sheet adapter is a hard error for that table", () => {
    const w = seeded();
    const plan = merge({
      baseline: w.baseline,
      sheet: { ...w.sheet.snapshot(), errors: { [TL]: 'Tab "Tindak Lanjut": kolom tidak ditemukan.' } },
      db: w.db.snapshot(),
      specs: w.specs,
    });
    expect(tp(plan, "action_items").error).toContain("kolom tidak ditemukan");
    expect(tp(plan, "action_items").issues[0].kind).toBe("header_error");
  });

  test("extra and reordered columns are fine; writes land in the right column", () => {
    const w = new World(smallDb());
    w.sheet.addTab(TM, [["Catatan pribadi", "Temuan", "Lingkup", "Minggu Ke"], ["x", "Versi sheet", "SUB", 1]]);
    w.sync();
    expect(w.sheet.tabs.get(TM)!.values.slice(1)).toEqual([
      ["x", "Temuan minggu 1", "SUB", 1],
      ["", "Ringkasan KPS minggu 1", "KPS", 1],
    ]);
    expectSteady(w);
  });

  test("deleted tab: recreated and refilled from the DB, nothing deleted in the DB", () => {
    const w = seeded();
    w.sheet.tabs.delete(TM);
    const plan = w.sync();
    expect(tp(plan, "weekly_reports").sheet.create).toBe(true);
    expect(tp(plan, "weekly_reports").db.deletes).toEqual([]);
    expect(w.sheet.rows(TM)).toHaveLength(2);
    expectSteady(w);
  });

  test("tab cleared completely (header too): header rewritten and refilled", () => {
    const w = seeded();
    w.sheet.tabs.get(TM)!.values = [];
    const plan = w.sync();
    expect(tp(plan, "weekly_reports").sheet.writeHeader).toBe(true);
    expect(tp(plan, "weekly_reports").db.deletes).toEqual([]);
    expect(w.sheet.rows(TM)).toHaveLength(2);
    expectSteady(w);
  });
});

// ------------------------------------------------------------------ duplicates and empty rows

describe("duplicate keys and empty rows", () => {
  test("duplicate keys in the sheet: every copy is a validation error and the key is left alone", () => {
    const w = seeded();
    const r = rowOf(w, LOG, "ID SDM", "SUB-01");
    const t = w.sheet.tabs.get(LOG)!;
    const copy = [...t.values[r - 1]];
    copy[specFor("weekly_scores").columns.findIndex((c) => c.header === "A Grooming & Appearance")] = 10;
    t.values.push(copy);
    w.db.find("weekly_scores", { staff_code: "SUB-01", week: 1 })!.observer = "dari web";
    const plan = w.sync();
    const ws = tp(plan, "weekly_scores");
    expect(ws.issues.filter((i) => i.kind === "duplicate_key")).toHaveLength(2);
    expect(ws.db.updates).toEqual([]);
    expect(ws.sheet.updates).toEqual([]);
    expect(w.db.find("weekly_scores", { staff_code: "SUB-01", week: 1 })!.score_grooming).toBe(80);
    expectSteady(w);

    t.values.pop();
    w.sync();
    expect(w.sheet.cell(LOG, r, "Observer / Coach")).toBe("dari web");
    expectSteady(w);
  });

  test("pre-filled empty entry rows count as absent; filling one inserts, clearing it deletes", () => {
    const w = seeded();
    const n = w.sheet.rows(LOG).length + 2;
    for (const [i, week] of [2, 3].entries()) {
      w.sheet.setCell(LOG, n + i, "Minggu Ke", week);
      w.sheet.setCell(LOG, n + i, "ID SDM", "SUB-01");
    }
    let plan = w.sync();
    expect(tp(plan, "weekly_scores").db.inserts).toEqual([]);
    expectSteady(w);

    w.sheet.setCell(LOG, n, "A Grooming & Appearance", 90);
    plan = w.sync();
    expect(tp(plan, "weekly_scores").db.inserts).toHaveLength(1);
    expect(w.db.find("weekly_scores", { staff_code: "SUB-01", week: 2 })!.score_grooming).toBe(90);
    expectSteady(w);

    w.sheet.setCell(LOG, n, "A Grooming & Appearance", "");
    plan = w.sync();
    expect(tp(plan, "weekly_scores").db.deletes).toEqual([{ staff_code: "SUB-01", week: 2 }]);
    expect(w.sheet.cell(LOG, n, "ID SDM")).toBe("SUB-01");
    expectSteady(w);
  });

  test("a DB row lands in its pre-filled entry row instead of being appended", () => {
    const w = seeded();
    const n = w.sheet.rows(LOG).length + 2;
    w.sheet.setCell(LOG, n, "Minggu Ke", 3);
    w.sheet.setCell(LOG, n, "ID SDM", "SUB-02");
    w.sync();
    w.db.rows("weekly_scores").push(weeklyRow(9, "SUB-02", 3, { score_grooming: 60 }));
    const plan = w.sync();
    expect(tp(plan, "weekly_scores").sheet.appends).toEqual([]);
    expect(w.sheet.cell(LOG, n, "A Grooming & Appearance")).toBe(60);
    expectSteady(w);
  });

  test("a row deleted in the DB clears the entry row's cells (row kept for input)", () => {
    const w = seeded();
    const r = rowOf(w, LOG, "ID SDM", "SUB-02");
    w.db.tables.set("weekly_scores", w.db.rows("weekly_scores").filter((x) => x.staff_code !== "SUB-02"));
    const plan = w.sync();
    expect(tp(plan, "weekly_scores").sheet.deleteRows).toEqual([]);
    expect(w.sheet.cell(LOG, r, "A Grooming & Appearance")).toBe("");
    expect(w.sheet.cell(LOG, r, "ID SDM")).toBe("SUB-02");
    expectSteady(w);
  });

  test("blank rows between data rows are ignored", () => {
    const w = seeded();
    w.sheet.tabs.get(TL)!.values.splice(2, 0, [], ["", "", "", ""]);
    expect(pending(w.plan())).toEqual([]);
  });
});

// ------------------------------------------------------------------ normalization in the merge

describe("equivalent representations cause no phantom diffs", () => {
  test('"4" vs 4.0, date text vs serial, padded text', () => {
    const w = seeded();
    const sdm = rowOf(w, SDM, "ID SDM", "SUB-01");
    w.sheet.setCell(SDM, sdm, "Role Play", "80");
    w.sheet.setCell(SDM, sdm, "Post-Test", "90,0");
    w.sheet.setCell(SDM, sdm, "Unit", " sub ");
    w.sheet.setCell(SDM, sdm, "Nama Petugas", "  Petugas SUB-01 ");
    const bmi = rowOf(w, BMI, "ID SDM", "SUB-01");
    w.sheet.setCell(BMI, bmi, "Tgl Cek", "12/10/2026");
    w.sheet.setCell(BMI, bmi, "Berat (kg)", "65.50");
    const tl = rowOf(w, TL, "ID", "GA-TL01");
    w.sheet.setCell(TL, tl, "Batas Waktu", "30 Okt 2026");
    expect(pending(w.plan())).toEqual([]);
  });

  test("DB numeric strings and floats normalize too", () => {
    const db = smallDb();
    (db.bmi_checks![0] as Record<string, unknown>).weight_kg = "65.5";
    const w = new World(db);
    w.sync();
    w.db.find("bmi_checks", { staff_code: "SUB-01", period: 1 })!.weight_kg = 65.50000000001;
    expect(pending(w.plan())).toEqual([]);
  });
});

// ------------------------------------------------------------------ generated ids (Penggantian SDM)

describe("Penggantian SDM: ID Sistem written back after insert", () => {
  test("new sheet row without id gets the DB id written back", () => {
    const w = seeded();
    const n = w.sheet.rows(PG).length + 2;
    w.sheet.setCell(PG, n, "Unit", "KNO");
    w.sheet.setCell(PG, n, "Nama SDM Diganti", "Orang Baru");
    const plan = w.sync();
    expect(tp(plan, "replacements").db.pending).toHaveLength(1);
    expect(tp(plan, "replacements").sheet.idWrites).toEqual([{ ref: 1, row: n, col: 0 }]);
    expect(w.sheet.cell(PG, n, "ID Sistem")).toBe(2);
    expect(w.baseline!.tables.replacements!["2"]).toMatchObject({ id: 2, replaced_name: "Orang Baru" });
    expectSteady(w);
  });

  test("first run: id-less sheet rows are matched to existing DB rows by station + name", () => {
    const w = new World({ ...smallDb(), replacements: [replacementRow(7), replacementRow(8, { station: "KNO" })] });
    w.sheet.addTab(
      PG,
      tableValues("replacements", [
        { Unit: "SUB", "Nama SDM Diganti": "Diganti 7", Program: "IULS", "Dilaporkan ke Garuda": "Ya" },
        { Unit: "kno", "Nama SDM Diganti": " diganti  8" },
      ]),
    );
    const plan = w.sync();
    expect(tp(plan, "replacements").db.pending).toEqual([]);
    expect(w.sheet.rows(PG).map((r) => r["ID Sistem"])).toEqual([7, 8]);
    expect(tp(plan, "replacements").conflicts[0]).toMatchObject({ rowKey: "7", column: "reported", sheet: "Ya", db: "Belum", resolution: "db-wins" });
    expect(tp(plan, "replacements").conflicts[1]).toMatchObject({ rowKey: "8", column: "replaced_name", resolution: "db-wins" });
    expectSteady(w);
  });

  test("an id cell cleared by hand is re-linked, not duplicated", () => {
    const w = seeded();
    w.sheet.setCell(PG, 2, "ID Sistem", "");
    w.sync();
    expect(w.db.rows("replacements")).toHaveLength(1);
    expect(w.sheet.cell(PG, 2, "ID Sistem")).toBe(1);
    expectSteady(w);
  });

  test("ID SDM must name an existing staff member; deleting that staff nulls it", () => {
    const w = seeded();
    const r = rowOf(w, PG, "ID Sistem", 1);
    w.sheet.setCell(PG, r, "ID SDM", "XXX-01");
    let plan = w.sync();
    expect(tp(plan, "replacements").issues[0]).toMatchObject({ kind: "unknown_parent", column: "staff_code" });
    expect(w.db.find("replacements", { id: 1 })!.staff_code).toBeNull();

    w.sheet.setCell(PG, r, "ID SDM", "SUB-02");
    plan = w.sync();
    expect(w.db.find("replacements", { id: 1 })!.staff_code).toBe("SUB-02");
    expect(w.sheet.note(PG, r, "ID SDM")).toBeUndefined();
    expectSteady(w);

    w.sheet.tabs.get(SDM)!.values.splice(rowOf(w, SDM, "ID SDM", "SUB-02") - 1, 1);
    w.sync();
    expect(w.db.find("replacements", { id: 1 })!.staff_code).toBeNull();
    expect(w.sheet.cell(PG, r, "ID SDM")).toBe("");
    expectSteady(w);
  });
});

// ------------------------------------------------------------------ Remedial (keyed by ID SDM)

describe("Remedial keyed by ID SDM (one row per participant)", () => {
  test("a row is a record as long as ID SDM is filled; edits and new rows sync", () => {
    const w = seeded();
    const r = rowOf(w, REM, "ID SDM", "SUB-02");
    w.sheet.setCell(REM, r, "Tindakan Remedial", "individual coaching");
    const n = w.sheet.rows(REM).length + 2;
    w.sheet.setCell(REM, n, "ID SDM", "DPS-01");
    const plan = w.sync();
    const t = tp(plan, "remedials");
    expect(t.db.updates).toEqual([{ key: { staff_code: "SUB-02" }, set: { action: "Individual Coaching" } }]);
    expect(t.db.inserts).toEqual([{ staff_code: "DPS-01", action: null, remedial_on: null, role_play: null, post_test: null, reported: null, notes: null }]);
    expectSteady(w);
  });

  test("deleting the staff member cascades to the remedial row", () => {
    const w = seeded();
    w.sheet.tabs.get(SDM)!.values.splice(rowOf(w, SDM, "ID SDM", "SUB-02") - 1, 1);
    const plan = w.sync();
    expect(tp(plan, "remedials").sheet.deleteRows).toEqual([2]);
    expect(w.db.rows("remedials")).toEqual([]);
    expectSteady(w);
  });
});

// ------------------------------------------------------------------ Temuan Mingguan (week + scope)

describe("Temuan Mingguan keyed by (Minggu Ke, Lingkup)", () => {
  test("same week, different scopes are separate rows; a new scope row from the sheet is inserted", () => {
    const w = seeded();
    const n = w.sheet.rows(TM).length + 2;
    w.sheet.setCell(TM, n, "Minggu Ke", 1);
    w.sheet.setCell(TM, n, "Lingkup", "dps");
    w.sheet.setCell(TM, n, "Temuan", "Temuan DPS");
    const plan = w.sync();
    expect(tp(plan, "weekly_reports").db.inserts).toEqual([{ week: 1, scope: "DPS", findings: "Temuan DPS" }]);
    expect(w.db.rows("weekly_reports")).toHaveLength(3);
    expectSteady(w);
  });

  test("duplicate (week, scope) is a validation error; unknown scope is rejected", () => {
    const w = seeded();
    const n = w.sheet.rows(TM).length + 2;
    w.sheet.setCell(TM, n, "Minggu Ke", 1);
    w.sheet.setCell(TM, n, "Lingkup", "SUB");
    w.sheet.setCell(TM, n, "Temuan", "lagi");
    w.sheet.setCell(TM, n + 1, "Minggu Ke", 2);
    w.sheet.setCell(TM, n + 1, "Lingkup", "Pusat");
    const plan = w.sync();
    const t = tp(plan, "weekly_reports");
    expect(t.issues.map((i) => i.kind).sort()).toEqual(["duplicate_key", "duplicate_key", "invalid_value"]);
    expect(t.db).toEqual({ inserts: [], updates: [], deletes: [], pending: [] });
  });
});

describe("attribution columns are not synced", () => {
  test("changes to updated_by_link / updated_by / updated_at alone produce an empty plan", () => {
    const w = seeded();
    for (const r of w.db.rows("weekly_reports")) r.updated_by_link = "00000000-0000-0000-0000-0000000000ff";
    for (const r of w.db.rows("weekly_scores")) r.updated_by = "00000000-0000-0000-0000-0000000000aa";
    for (const r of w.db.rows("bmi_checks")) Object.assign(r, { updated_by_user: "x", updated_by_link: "y", updated_at: "2027-01-01T00:00:00Z" });
    for (const r of w.db.rows("action_items")) Object.assign(r, { sort_order: 99, updated_by_link: "z" });
    for (const r of w.db.rows("remedials")) Object.assign(r, { id: 77, sort_order: 5, updated_at: "2027-01-01T00:00:00Z" });
    expectSteady(w);
  });
});

// ------------------------------------------------------------------ settings (Parameter)

describe("Parameter (settings as key/value rows)", () => {
  const rowOfKey = (w: World, key: string) => rowOf(w, PAR, "Parameter", key);

  test("edit in the sheet updates the settings row", () => {
    const w = seeded();
    w.sheet.setCell(PAR, rowOfKey(w, "week1_start"), "Nilai", "19/10/2026");
    const plan = w.sync();
    expect(tp(plan, "settings").db.updates).toEqual([{ key: { key: "week1_start" }, set: { value: "2026-10-19" } }]);
    expect(w.db.rows("settings")[0].week1_start).toBe("2026-10-19");
    expectSteady(w);
  });

  test("cross-field rule (Normal s.d. <= Overweight s.d.) rejects the edit", () => {
    const w = seeded();
    const r = rowOfKey(w, "bmi_normal_max");
    w.sheet.setCell(PAR, r, "Nilai", 30);
    const plan = w.sync();
    expect(tp(plan, "settings").db.updates).toEqual([]);
    expect(w.db.rows("settings")[0].bmi_normal_max).toBe(25);
    expect(w.sheet.note(PAR, r, "Nilai")).toContain("berurutan");
    expectSteady(w);
  });

  test("a deleted parameter row is restored, never deleted in the DB", () => {
    const w = seeded();
    w.sheet.tabs.get(PAR)!.values.splice(rowOfKey(w, "pass_grade") - 1, 1);
    w.sync();
    expect(w.db.rows("settings")[0].pass_grade).toBe(85);
    expect(w.sheet.rows(PAR).find((r) => r.Parameter === "pass_grade")!.Nilai).toBe(85);
    expectSteady(w);
  });

  test("unknown key and invalid value", () => {
    const w = seeded();
    const n = w.sheet.rows(PAR).length + 2;
    w.sheet.setCell(PAR, n, "Parameter", "foo");
    w.sheet.setCell(PAR, n, "Nilai", 1);
    w.sheet.setCell(PAR, rowOfKey(w, "weeks"), "Nilai", 50);
    const plan = w.sync();
    expect(tp(plan, "settings").issues.map((i) => i.kind).sort()).toEqual(["invalid_value", "unknown_setting"]);
    expect(w.db.rows("settings")[0].weeks).toBe(10);
  });

  test("clearing a value is rejected (every parameter is required); replacement_deadline syncs", () => {
    const w = seeded();
    w.sheet.setCell(PAR, rowOfKey(w, "target_coverage"), "Nilai", "");
    const plan = w.sync();
    expect(tp(plan, "settings").issues[0]).toMatchObject({ kind: "required_missing", rowKey: "target_coverage" });
    expect(w.db.rows("settings")[0].target_coverage).toBe(812);
    w.sheet.setCell(PAR, rowOfKey(w, "target_coverage"), "Nilai", 812);
    w.sheet.setCell(PAR, rowOfKey(w, "replacement_deadline"), "Nilai", "31/12/2026");
    w.sync();
    expect(w.db.rows("settings")[0].replacement_deadline).toBe("2026-12-31");
    expectSteady(w);
  });

  test("settings row missing in the DB is a hard error", () => {
    const w = new World({ ...smallDb(), settings: [] });
    expect(tp(w.plan(), "settings").error).not.toBeNull();
  });
});

// ------------------------------------------------------------------ idempotency

describe("idempotency", () => {
  test("a long mixed sequence always settles: re-merging after each run yields an empty plan", () => {
    const w = seeded();
    const steps: ((w: World) => void)[] = [
      (w) => w.sheet.setCell(SDM, rowOf(w, SDM, "ID SDM", "SUB-01"), "Catatan", "a"),
      (w) => (staff(w, "SUB-02").post_test = 70),
      (w) => w.db.rows("staff").push(staffRow("KNO-01", 4, { station: "KNO" })),
      (w) => w.sheet.setCell(LOG, 2, "Catatan Coaching", "fokus grooming"),
      (w) => w.db.rows("weekly_scores").push(weeklyRow(10, "KNO-01", 2)),
      (w) => w.sheet.setCell(BMI, 2, "Berat (kg)", 64),
      (w) => (w.db.find("action_items", { code: "GA-TL02" })!.progress = 50),
      (w) => w.sheet.setCell(TM, 2, "Temuan", "baru"),
      (w) => w.db.rows("replacements").push(replacementRow(5, { station: "DPS" })),
      (w) => w.sheet.setCell(PG, 2, "Post-Test", 85),
      (w) => w.sheet.setCell(REM, 2, "Role Play Ulang", 88),
      (w) => w.db.rows("remedials").push(remedialRow(3, "KNO-01")),
      (w) => (staff(w, "DPS-01").bmi_has_note = true),
      (w) => {
        staff(w, "SUB-01").name = "Nama Web";
        w.sheet.setCell(SDM, rowOf(w, SDM, "ID SDM", "SUB-01"), "Nama Petugas", "Nama Sheet");
      },
    ];
    for (const step of steps) {
      step(w);
      w.sync();
      expectSteady(w);
    }
    expect(staff(w, "SUB-01").name).toBe("Nama Web");
    expect(w.db.find("weekly_reports", { week: 1, scope: "SUB" })!.findings).toBe("baru");
    expect(w.sheet.rows(SDM).some((r) => r["ID SDM"] === "KNO-01")).toBe(true);
  });

  test("merge is deterministic for identical inputs", () => {
    const w = seeded();
    w.sheet.setCell(SDM, 2, "Catatan", "x");
    const input = { baseline: w.baseline, sheet: w.sheet.snapshot(), db: w.db.snapshot(), specs: w.specs };
    expect(JSON.stringify(merge(input))).toBe(JSON.stringify(merge(input)));
  });

  test("settings values come from the DB on the first run", () => {
    const w = new World({ ...smallDb(), settings: [settingsRow({ weeks: 12 })] });
    w.sync();
    expect(w.sheet.rows(PAR).find((r) => r.Parameter === "weeks")!.Nilai).toBe(12);
  });
});

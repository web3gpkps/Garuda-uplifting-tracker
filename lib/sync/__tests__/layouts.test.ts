/**
 * Workbook layouts end to end: project -> merge -> translate -> apply on an in-memory copy of the
 * Garuda workbook (testing/workbook.ts), against a fake DB.
 */
import { describe, expect, test } from "bun:test";
import { LayoutViolation, PERCENT, blockEnd, projectAll, translate } from "../layouts";
import { countPlan, isPlanEmpty, merge } from "../merge";
import { isoToSerial } from "../normalize";
import { a1Column } from "../sheets";
import { actionRow, bmiRow, remedialRow, replacementRow, smallDb, staffRow, weeklyRow } from "../testing/fixtures";
import { WorkbookWorld, type WorkbookOptions } from "../testing/workbook";
import type { DbSnapshot, Plan, SyncTable } from "../types";

const MS = "Master SDM";
const BMI = "Cek BMI 2 Mingguan";
const LOG = "Log Performa Mingguan";
const TL = "Tindak Lanjut";
const REM = "Remedial";
const PG = "Penggantian SDM";
const PAR = "Parameter";
const TM = "Temuan Mingguan";
const UNTOUCHED = ["Petunjuk", "Dashboard", "Laporan Mingguan", "Rekap Performa", "Data Coaching", "Data Training"];

const tp = (plan: Plan, table: SyncTable) => plan.tables.find((t) => t.table === table)!;

function world(opts: WorkbookOptions = {}, data: DbSnapshot = smallDb()) {
  const w = new WorkbookWorld(data, { dueFormula: ["GA-TL01"], ...opts });
  w.sync();
  expectSteady(w);
  return w;
}

function expectSteady(w: WorkbookWorld) {
  const { plan, counts } = w.prepare();
  const busy = Object.entries(countPlan(plan)).filter(
    ([, c]) => c.dbInserts + c.dbUpdates + c.dbDeletes + c.sheetCellUpdates + c.sheetAppends + c.conflicts + c.newIssues > 0 || c.createTab,
  );
  expect(busy).toEqual([]);
  expect(isPlanEmpty(plan)).toBe(true);
  expect(counts.cellWrites + counts.headerCells + counts.notes + counts.appends + counts.rowDeletes).toBe(0);
}

const staff = (w: WorkbookWorld, code: string) => w.db.find("staff", { code })!;
const cells = (w: WorkbookWorld, tab: string, row: number, cols: string[]) => cols.map((c) => w.book.get(tab, `${c}${row}`));

// ------------------------------------------------------------------ first sync

describe("first sync on the imported workbook (same data on both sides)", () => {
  test("no data changes in either direction; only the one-time setup", () => {
    const w = new WorkbookWorld(smallDb(), { dueFormula: ["GA-TL01"] });
    const { plan, ops, counts } = w.sync();
    for (const t of plan.tables) {
      expect(t.db).toEqual({ inserts: [], updates: [], deletes: [], pending: [] });
      expect(t.conflicts).toEqual([]);
      expect(t.issues).toEqual([]);
    }
    expect(counts.createTabs).toEqual([TM]);
    expect(ops.headerCells.map((h) => `${h.tab}!${a1Column(h.col)}${h.row}=${h.text}${h.hide ? " (hidden)" : ""}`)).toEqual([
      "Penggantian SDM!P4=ID Sistem (hidden)",
      "Penggantian SDM!Q4=ID SDM",
    ]);
    // The existing replacement is linked to its DB row by unit + name: its id lands in P.
    expect(ops.writes.filter((x) => x.tab !== TM).map((x) => `${x.tab}!${a1Column(x.col)}${x.row}`)).toEqual(["Penggantian SDM!P5"]);
    expect(w.book.get(PG, "P5")).toBe(1);
    expect(w.book.hidden(PG, "P")).toBe(true);
    expect([...w.book.written].sort()).toEqual([PG, TM]);
    expect(cells(w, TM, 1, ["A", "B", "C"])).toEqual(["Minggu Ke", "Lingkup", "Temuan"]);
    expect(w.book.locale).toBe("in_ID");
    expectSteady(w);
  });

  test("a workbook that already has the engine's columns needs nothing but the Temuan tab", () => {
    const w = new WorkbookWorld(smallDb(), { withIdColumns: true });
    const { ops } = w.sync();
    expect(ops.headerCells).toEqual([]);
    expect(ops.writes.every((x) => x.tab === TM)).toBe(true);
    expectSteady(w);
  });

  test("blocks run to the last formula row: free rows inside them are the capacity", () => {
    const w = world();
    const real = w.book.snapshot();
    expect(blockEnd(real.tabs[MS]!, 5)).toBe(10); // 3 staff + 3 free rows
    expect(blockEnd(real.tabs[LOG]!, 5)).toBe(14); // 2 weeks x 3 staff + 4 spare
    const { sheet } = projectAll(real);
    expect([MS, LOG, TL, REM, PG].map((t) => sheet.tabs[t]!.capacity)).toEqual([3, 4, 3, 3, 5]);
  });

  test("untouched tabs and workbook formulas survive a busy sequence of edits", () => {
    const w = world();
    const probes: [string, string][] = [[MS, "L5"], [LOG, "B5"], [BMI, "B6"], [BMI, "G6"], [BMI, "H6"], [BMI, "M6"], [TL, "Q5"], [TL, "J5"], [REM, "C5"], [PG, "L5"], [PAR, "C30"]];
    const before = probes.map(([t, a]) => w.book.formula(t, a));
    staff(w, "SUB-01").notes = "web";
    w.book.set(MS, "S6", "sheet");
    w.db.rows("weekly_scores").push(weeklyRow(20, "SUB-01", 3));
    w.db.rows("action_items").push(actionRow("GA-TL03", 9));
    w.db.rows("bmi_checks").push(bmiRow(9, "SUB-02", 2));
    w.db.rows("remedials").push(remedialRow(5, "DPS-01"));
    w.db.rows("staff").push(staffRow("UPG-01", 9));
    w.sync();
    w.sync();
    expectSteady(w);
    for (const t of UNTOUCHED) expect(w.book.written.has(t)).toBe(false);
    expect(probes.map(([t, a]) => w.book.formula(t, a))).toEqual(before);
  });
});

// ------------------------------------------------------------------ formula cells

describe("formula cells are never read as input and never written", () => {
  test("Tindak Lanjut Batas Waktu: formula cell skipped, literal date synced", () => {
    const w = world();
    const formula = w.book.findRow(TL, "B", "GA-TL01");
    const literal = w.book.findRow(TL, "B", "GA-TL02");
    // DB changes the formula item's stored due date: the formula cell is left alone.
    w.db.find("action_items", { code: "GA-TL01" })!.due_date = "2027-04-05";
    // The sheet recalculates the formula: never read back.
    w.book.set(TL, `J${formula}`, isoToSerial("2026-11-05"), w.book.formula(TL, `J${formula}`));
    // A literal date edited by hand: synced.
    w.book.set(TL, `J${literal}`, isoToSerial("2026-11-15"));
    const { plan, ops } = w.sync();
    expect(tp(plan, "action_items").db.updates).toEqual([{ key: { code: "GA-TL02" }, set: { due_date: "2026-11-15" } }]);
    expect(ops.writes.some((x) => x.tab === TL && x.row === formula)).toBe(false);
    expect(w.book.formula(TL, `J${formula}`)).toBe("=EDATE(Parameter!$C$5,Parameter!$C$21)");
    expectSteady(w);
  });

  test("translate refuses a plan that would write a formula cell", () => {
    const w = world();
    const real = w.book.snapshot();
    const { sheet, projections } = projectAll(real);
    const plan = merge({ baseline: w.baseline, sheet, db: w.db.snapshot() });
    const t = tp(plan, "action_items");
    const vrow = sheet.tabs[TL]!.values.findIndex((r) => r[0] === "GA-TL01") + 1;
    t.sheet.updates.push({ row: vrow, col: t.sheet.colIndex.due_date, value: "2026-12-01", fmt: "date" });
    expect(() => translate(plan, projections, real)).toThrow(LayoutViolation);
  });

  test("translate refuses writes to untouched tabs", () => {
    const w = world();
    const real = w.book.snapshot();
    const { sheet, projections } = projectAll(real);
    const plan = merge({ baseline: w.baseline, sheet, db: w.db.snapshot() });
    const p = projections.get("staff")!;
    projections.set("staff", { ...p, cell: () => ({ tab: "Dashboard", row: 9, col: 2 }) });
    tp(plan, "staff").sheet.updates.push({ row: 2, col: 1, value: "x", fmt: "text" });
    expect(() => translate(plan, projections, real)).toThrow(/untouched tab "Dashboard"/);
  });
});

// ------------------------------------------------------------------ Master SDM

describe("Master SDM (header row 4, free rows, BMI flag and note in Cek BMI)", () => {
  test("a staff member added on the website fills the first free row, never inserts one", () => {
    const w = world();
    w.db.rows("staff").push(staffRow("UPG-01", 10, { name: "Petugas Baru", employee_no: null, bmi_has_note: true, bmi_note: "program BB" }));
    const { plan } = w.sync();
    expect(tp(plan, "staff").issues).toEqual([]);
    const r = w.book.findRow(MS, "B", "UPG-01");
    expect(r).toBe(8);
    expect(cells(w, MS, r, ["A", "C", "E", "F", "Q", "J"])).toEqual([4, "IULS", "UPG", "Petugas Baru", "Aktif", 80]);
    expect(w.book.formula(MS, `L${r}`)).toBeDefined();
    // Cek BMI row = Master row + 1: the mirror formula now shows the ID; flag and note filled.
    expect(cells(w, BMI, r + 1, ["B", "I", "AU"])).toEqual(["UPG-01", "Ya", "program BB"]);
    expect(w.book.formula(BMI, `B${r + 1}`)).toBe(`=IF('Master SDM'!B${r}="","",'Master SDM'!B${r})`);
    expectSteady(w);
  });

  test("a new staff member's BMI check goes into Cek BMI on the next run (no issue logged)", () => {
    const w = world();
    w.db.rows("staff").push(staffRow("UPG-01", 10));
    w.db.rows("bmi_checks").push(bmiRow(9, "UPG-01", 2, { height_cm: 160, weight_kg: 55 }));
    const first = w.sync();
    expect(tp(first.plan, "bmi_checks").issues).toEqual([]);
    const second = w.sync();
    expect(tp(second.plan, "bmi_checks").issues).toEqual([]);
    const r = w.book.findRow(BMI, "B", "UPG-01");
    expect(cells(w, BMI, r, ["O", "P", "Q"])).toEqual([isoToSerial("2026-10-12"), 160, 55]);
    expectSteady(w);
  });

  test("no free row left: reported, nothing written, the DB record is kept", () => {
    const w = world({ masterFree: 1 });
    w.db.rows("staff").push(staffRow("UPG-01", 10), staffRow("UPG-02", 11));
    const first = w.sync();
    const issues = tp(first.plan, "staff").issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: "no_sheet_row", rowKey: "UPG-02", isNew: true });
    expect(issues[0].message).toContain("Master SDM penuh");
    expect(w.book.findRow(MS, "B", "UPG-01")).toBe(8);
    const { plan } = w.sync();
    expect(tp(plan, "staff").issues[0].isNew).toBe(false);
    expect(tp(plan, "staff").db.deletes).toEqual([]);
    expect(staff(w, "UPG-02")).toBeDefined();
  });

  test("filling a free row in the sheet (ID, Unit, Nama) adds the staff member; Status gets its default", () => {
    const w = world();
    w.book.set(MS, "B9", "RUST-01");
    w.book.set(MS, "C9", "RUST");
    w.book.set(MS, "E9", "dps");
    w.book.set(MS, "F9", "Petugas Sheet");
    const { plan } = w.sync();
    expect(tp(plan, "staff").db.inserts).toMatchObject([{ code: "RUST-01", program: "RUST", station: "DPS", name: "Petugas Sheet", assignment_status: "Aktif" }]);
    expect(w.book.get(MS, "Q9")).toBe("Aktif");
    expectSteady(w);
  });

  test("a unit that is not in stations is rejected", () => {
    const w = world();
    const r = w.book.findRow(MS, "B", "SUB-01");
    w.book.set(MS, `E${r}`, "XYZ");
    const { plan } = w.sync();
    expect(tp(plan, "staff").db.updates).toEqual([]);
    expect(tp(plan, "staff").issues[0]).toMatchObject({ kind: "invalid_value", column: "station", sheetValue: "XYZ" });
    expect(w.book.note(MS, `E${r}`)).toContain("tidak ada di daftar unit");
  });

  test("clearing the name removes the staff member; the row becomes free again and children are cleared", () => {
    const w = world();
    const r = w.book.findRow(MS, "B", "SUB-02");
    const bmiR = r + 1;
    const logR = w.book.findRow(LOG, "C", "SUB-02");
    const remR = w.book.findRow(REM, "B", "SUB-02");
    w.book.set(MS, `F${r}`, undefined);
    const { plan } = w.sync();
    expect(tp(plan, "staff").db.deletes).toEqual([{ code: "SUB-02" }]);
    expect(cells(w, MS, r, ["A", "B", "C", "E", "J", "Q"])).toEqual([2, "", "", "", "", ""]);
    expect(w.book.formula(MS, `P${r}`)).toBeDefined();
    // Cascade: Log inputs cleared (week and ID stay), remedial row freed, BMI row empty.
    expect(cells(w, LOG, logR, ["A", "C", "H", "P"])).toEqual([1, "SUB-02", "", ""]);
    expect(cells(w, REM, remR, ["A", "B", "H", "O"])).toEqual([1, "", "", ""]);
    expect(w.book.get(BMI, `B${bmiR}`)).toBe("");
    expect(w.db.rows("remedials")).toEqual([]);
    expectSteady(w);
  });

  test("a staff member deleted on the website frees the Master row (ID cleared too)", () => {
    const w = world();
    const r = w.book.findRow(MS, "B", "DPS-01");
    w.db.tables.set("staff", w.db.rows("staff").filter((s) => s.code !== "DPS-01"));
    w.sync();
    expect(cells(w, MS, r, ["A", "B", "F"])).toEqual([3, "", ""]);
    w.db.rows("staff").push(staffRow("UPG-01", 10));
    w.sync();
    expect(w.book.findRow(MS, "B", "UPG-01")).toBe(r);
    expectSteady(w);
  });

  test("Ada Catatan BMI (Cek BMI I) and Catatan Program Kebugaran (AU) sync both ways", () => {
    const w = world();
    const r = w.book.findRow(BMI, "B", "SUB-01");
    w.book.set(BMI, `I${r}`, "ya");
    w.book.set(BMI, `AU${r}`, "turunkan 3 kg");
    w.sync();
    expect(staff(w, "SUB-01")).toMatchObject({ bmi_has_note: true, bmi_note: "turunkan 3 kg" });
    expect(w.book.get(BMI, `I${r}`)).toBe("ya"); // equal after normalization: not rewritten
    staff(w, "SUB-02").bmi_has_note = false;
    staff(w, "SUB-02").bmi_note = "dari web";
    w.sync();
    const r2 = w.book.findRow(BMI, "B", "SUB-02");
    expect(cells(w, BMI, r2, ["I", "AU"])).toEqual(["Tidak", "dari web"]);
    w.book.set(BMI, `I${r2}`, "Mungkin");
    const { plan } = w.sync();
    expect(tp(plan, "staff").issues[0]).toMatchObject({ kind: "invalid_value", column: "bmi_has_note" });
    expect(staff(w, "SUB-02").bmi_has_note).toBe(false);
    w.book.set(BMI, `I${r2}`, undefined);
    w.sync();
    expect(staff(w, "SUB-02").bmi_has_note).toBeNull();
    expectSteady(w);
  });

  test("a Cek BMI row that no longer mirrors its Master row is never written by position", () => {
    const w = world();
    const r = w.book.findRow(MS, "B", "SUB-02");
    w.book.set(BMI, `B${r + 1}`, "DPS-01"); // formula overwritten with another ID
    staff(w, "SUB-02").bmi_note = "dari web";
    const { ops } = w.sync();
    expect(ops.writes.some((x) => x.tab === BMI && x.row === r + 1)).toBe(false);
  });

  test("renamed header in row 4: Master SDM is not synced at all, other tabs continue", () => {
    const w = world();
    w.book.set(MS, "F4", "Nama");
    staff(w, "SUB-01").name = "Nama Web";
    w.book.set(TL, `K${w.book.findRow(TL, "B", "GA-TL01")}`, "PIC Baru");
    const { plan, ops } = w.sync();
    expect(tp(plan, "staff").error).toContain('"Nama Petugas"');
    expect(ops.writes.some((x) => x.tab === MS)).toBe(false);
    expect(w.db.find("action_items", { code: "GA-TL01" })!.pic).toBe("PIC Baru");
  });
});

// ------------------------------------------------------------------ Cek BMI

describe("Cek BMI 2 Mingguan (wide in the sheet, long in the DB, 6 slots)", () => {
  test("slot columns map to (staff, period) rows both ways", () => {
    const w = world();
    const sub02 = w.book.findRow(BMI, "B", "SUB-02");
    w.book.set(BMI, `O${sub02}`, isoToSerial("2026-10-26"));
    w.book.set(BMI, `P${sub02}`, 165);
    w.book.set(BMI, `Q${sub02}`, "60,5");
    w.db.rows("bmi_checks").push(bmiRow(7, "DPS-01", 6, { check_date: "2026-12-21", height_cm: 158.5, weight_kg: 52 }));
    const { plan } = w.sync();
    expect(tp(plan, "bmi_checks").db.inserts).toEqual([
      { staff_code: "SUB-02", period: 2, check_date: "2026-10-26", height_cm: 165, weight_kg: 60.5 },
    ]);
    const dps = w.book.findRow(BMI, "B", "DPS-01");
    expect(cells(w, BMI, dps, ["AI", "AJ", "AK"])).toEqual([isoToSerial("2026-12-21"), 158.5, 52]);
    expect(w.book.formula(BMI, `AL${dps}`)).toBeDefined();
    expectSteady(w);
  });

  test("a date without height and weight is noted, not saved", () => {
    const w = world();
    const r = w.book.findRow(BMI, "B", "SUB-01");
    w.book.set(BMI, `Y${r}`, isoToSerial("2026-11-23"));
    const { plan } = w.sync();
    expect(tp(plan, "bmi_checks").db.inserts).toEqual([]);
    expect(tp(plan, "bmi_checks").issues[0]).toMatchObject({ kind: "incomplete_row", rowKey: "SUB-01|4" });
    expect(w.book.note(BMI, `Z${r}`)).toContain("Baris belum lengkap");
    expectSteady(w);
  });

  test("clearing height and weight deletes that check; the date is cleared with it", () => {
    const w = world();
    const r = w.book.findRow(BMI, "B", "SUB-01");
    w.book.set(BMI, `K${r}`, undefined);
    w.book.set(BMI, `L${r}`, undefined);
    const { plan } = w.sync();
    expect(tp(plan, "bmi_checks").db.deletes).toEqual([{ staff_code: "SUB-01", period: 1 }]);
    expect(w.book.get(BMI, `J${r}`)).toBe("");
    expect(w.book.formula(BMI, `M${r}`)).toBeDefined();
    expectSteady(w);
  });

  test("a DB check for a slot the sheet has no columns for is reported", () => {
    const w = world();
    w.db.rows("bmi_checks").push(bmiRow(8, "SUB-01", 7));
    const { plan, ops } = w.sync();
    expect(tp(plan, "bmi_checks").issues[0]).toMatchObject({ kind: "no_sheet_row", rowKey: "SUB-01|7" });
    expect(ops.writes.filter((x) => x.tab === BMI)).toEqual([]);
  });
});

// ------------------------------------------------------------------ Log Performa

describe("Log Performa Mingguan (pre-made rows, spare rows)", () => {
  test("scores typed into a pre-made row are inserted", () => {
    const w = world();
    const r = w.book.findRow(LOG, "C", "DPS-01", w.book.findRow(LOG, "A", 2));
    w.book.set(LOG, `G${r}`, "boarding gate");
    w.book.set(LOG, `H${r}`, 75);
    w.book.set(LOG, `O${r}`, "Senyum");
    w.book.set(LOG, `P${r}`, "SPV");
    const { plan } = w.sync();
    expect(tp(plan, "weekly_scores").db.inserts).toEqual([
      { staff_code: "DPS-01", week: 2, touch_point: "Boarding Gate", score_grooming: 75, score_knowledge: null, score_attitude: null, score_communication: null, gap_topic: "Senyum", observer: "SPV", coaching_notes: null },
    ]);
    expectSteady(w);
  });

  test("a DB row with no pre-made row goes into the first spare row (formulas already there)", () => {
    const w = world();
    const spare = w.book.findRow(LOG, "A", 2) + 3; // after week 2's three staff rows
    w.db.rows("weekly_scores").push(weeklyRow(30, "SUB-02", 11, { score_grooming: 60 }));
    w.sync();
    expect(cells(w, LOG, spare, ["A", "C", "H"])).toEqual([11, "SUB-02", 60]);
    expect(w.book.formula(LOG, `L${spare}`)).toBeDefined();
    expectSteady(w);
  });

  test("no spare row left: reported, never written below the block", () => {
    const w = world({ logSpare: 0 });
    w.db.rows("weekly_scores").push(weeklyRow(30, "SUB-02", 11));
    const { plan, ops } = w.sync();
    expect(tp(plan, "weekly_scores").issues[0]).toMatchObject({ kind: "no_sheet_row", rowKey: "SUB-02|11" });
    expect(ops.writes.filter((x) => x.tab === LOG)).toEqual([]);
  });

  test("a score of 101 is rejected; a row deleted in the DB clears the inputs (week and ID stay)", () => {
    const w = world();
    const r = w.book.findRow(LOG, "C", "SUB-02");
    w.book.set(LOG, `K${r}`, 101);
    const { plan } = w.sync();
    expect(tp(plan, "weekly_scores").issues[0]).toMatchObject({ kind: "invalid_value", column: "score_communication" });
    expect(w.book.note(LOG, `K${r}`)).toContain("Di luar rentang 0–100");
    w.db.tables.set("weekly_scores", w.db.rows("weekly_scores").filter((x) => x.staff_code !== "SUB-02"));
    w.sync();
    expect(cells(w, LOG, r, ["A", "C", "G", "H", "K", "P"])).toEqual([1, "SUB-02", "", "", "", ""]);
    expect(w.book.note(LOG, `K${r}`)).toBeUndefined();
    expectSteady(w);
  });
});

// ------------------------------------------------------------------ Tindak Lanjut

describe("Tindak Lanjut (% Progres scaling, numbered rows)", () => {
  test("PERCENT transform: fraction in the sheet, 0..100 in the DB", () => {
    expect(PERCENT.read(0.5)).toBe(50);
    expect(PERCENT.read(0.15)).toBe(15);
    expect(PERCENT.read(1)).toBe(100);
    expect(PERCENT.read("75%")).toBe(75);
    expect(PERCENT.read(50)).toBe(5000);
    expect(PERCENT.write(75)).toBe(0.75);
    expect(PERCENT.write(null)).toBe("");
  });

  test("progress syncs scaled both ways; 50 typed into a % cell (5000%) is rejected", () => {
    const w = world();
    const r1 = w.book.findRow(TL, "B", "GA-TL01");
    const r2 = w.book.findRow(TL, "B", "GA-TL02");
    w.book.set(TL, `M${r1}`, 0.5);
    w.db.find("action_items", { code: "GA-TL02" })!.progress = 75;
    w.sync();
    expect(w.db.find("action_items", { code: "GA-TL01" })!.progress).toBe(50);
    expect(w.book.get(TL, `M${r2}`)).toBe(0.75);
    expectSteady(w);

    w.book.set(TL, `M${r1}`, 50);
    const { plan } = w.sync();
    expect(tp(plan, "action_items").db.updates).toEqual([]);
    expect(w.book.note(TL, `M${r1}`)).toContain("Di luar rentang 0–100");
  });

  test("Catatan Garuda / KPS and Sumber sync", () => {
    const w = world();
    const r = w.book.findRow(TL, "B", "GA-TL02");
    w.book.set(TL, `P${r}`, "Catatan KPS");
    w.db.find("action_items", { code: "GA-TL02" })!.source = "Slide 16";
    w.sync();
    expect(w.db.find("action_items", { code: "GA-TL02" })!.kps_notes).toBe("Catatan KPS");
    expect(w.book.get(TL, `S${r}`)).toBe("Slide 16");
    expectSteady(w);
  });

  test("a new action item from the website fills the next numbered row", () => {
    const w = world();
    w.db.rows("action_items").push(actionRow("GA-TL16", 16, { progress: 40 }));
    w.sync();
    const r = w.book.findRow(TL, "B", "GA-TL16");
    expect(r).toBe(7);
    expect(cells(w, TL, r, ["A", "C", "L", "M"])).toEqual([3, "Coaching Frontliner", "Belum Mulai", 0.4]);
    expect(w.book.formula(TL, `R${r}`)).toBeDefined();
    expectSteady(w);
  });

  test("an item deleted on the website keeps its row (inputs cleared, ID kept)", () => {
    const w = world();
    const r = w.book.findRow(TL, "B", "GA-TL02");
    w.db.tables.set("action_items", w.db.rows("action_items").filter((x) => x.code !== "GA-TL02"));
    w.sync();
    expect(cells(w, TL, r, ["A", "B", "L", "F"])).toEqual([2, "GA-TL02", "", ""]);
    expectSteady(w);
  });
});

// ------------------------------------------------------------------ Remedial

describe("Remedial (one row per participant, keyed by ID SDM)", () => {
  test("inputs sync both ways; formula columns are left alone", () => {
    const w = world();
    const r = w.book.findRow(REM, "B", "SUB-02");
    w.book.set(REM, `I${r}`, "20/10/2026");
    w.book.set(REM, `J${r}`, 88);
    w.book.set(REM, `K${r}`, 90);
    w.db.find("remedials", { staff_code: "SUB-02" })!.reported = "Ya";
    const { plan, ops } = w.sync();
    expect(tp(plan, "remedials").db.updates).toEqual([{ key: { staff_code: "SUB-02" }, set: { remedial_on: "2026-10-20", role_play: 88, post_test: 90 } }]);
    expect(w.book.get(REM, `O${r}`)).toBe("Ya");
    expect(ops.writes.filter((x) => x.tab === REM).map((x) => a1Column(x.col))).toEqual(["O"]);
    expectSteady(w);
  });

  test("a remedial added on the website fills the first free row (ID SDM written)", () => {
    const w = world();
    w.db.rows("remedials").push(remedialRow(2, "DPS-01", { action: "Individual Coaching" }));
    w.sync();
    const r = w.book.findRow(REM, "B", "DPS-01");
    expect(r).toBe(6);
    expect(cells(w, REM, r, ["A", "H", "O"])).toEqual([2, "Individual Coaching", "Belum"]);
    expectSteady(w);
  });

  test("typing an ID SDM in a free row adds it; an unknown ID is rejected", () => {
    const w = world();
    w.book.set(REM, "B6", "SUB-01");
    w.book.set(REM, "H6", "Refresher + Individual Coaching");
    w.book.set(REM, "B7", "XXX-99");
    const { plan } = w.sync();
    expect(tp(plan, "remedials").db.inserts).toMatchObject([{ staff_code: "SUB-01", action: "Refresher + Individual Coaching" }]);
    expect(tp(plan, "remedials").issues[0]).toMatchObject({ kind: "unknown_parent", column: "staff_code" });
    expect(w.book.note(REM, "B7")).toContain("tidak ada di Master SDM");
  });

  test("deleted on the website: the row is cleared, ID SDM too (No and formulas stay)", () => {
    const w = world();
    const r = w.book.findRow(REM, "B", "SUB-02");
    w.db.tables.set("remedials", []);
    w.sync();
    expect(cells(w, REM, r, ["A", "B", "H", "O"])).toEqual([1, "", "", ""]);
    expect(w.book.formula(REM, `M${r}`)).toBeDefined();
    expectSteady(w);
  });

  test("full: reported, nothing written", () => {
    const w = world({ remedialFree: 0 });
    w.db.rows("remedials").push(remedialRow(2, "DPS-01"));
    const { plan, ops } = w.sync();
    expect(tp(plan, "remedials").issues[0]).toMatchObject({ kind: "no_sheet_row", rowKey: "DPS-01" });
    expect(ops.writes.filter((x) => x.tab === REM)).toEqual([]);
  });
});

// ------------------------------------------------------------------ Penggantian SDM

describe("Penggantian SDM (pre-numbered slots, ID Sistem / ID SDM columns)", () => {
  test("a replacement typed into a free slot row is inserted and its ID Sistem written back", () => {
    const w = world();
    w.book.set(PG, "C6", "KNO");
    w.book.set(PG, "D6", "Orang Baru");
    w.book.set(PG, "K6", 88.8);
    w.book.set(PG, "Q6", "SUB-02");
    const { plan } = w.sync();
    expect(tp(plan, "replacements").db.pending).toMatchObject([
      { ref: 1, values: { station: "KNO", replaced_name: "Orang Baru", final_result: 88.8, staff_code: "SUB-02" } },
    ]);
    expect(w.book.get(PG, "P6")).toBe(2);
    expectSteady(w);
  });

  test("a replacement added on the website fills the first free slot (with its id)", () => {
    const w = world();
    w.db.rows("replacements").push(replacementRow(5, { station: "DPS", program: "RUST", staff_code: "DPS-01" }));
    w.sync();
    expect(cells(w, PG, 6, ["A", "B", "C", "D", "P", "Q"])).toEqual([2, "RUST", "DPS", "Diganti 5", 5, "DPS-01"]);
    expectSteady(w);
  });

  test("deleted on the website: the slot is cleared (No and formulas stay) and reusable", () => {
    const w = world();
    w.db.tables.set("replacements", []);
    w.sync();
    expect(cells(w, PG, 5, ["A", "D", "P"])).toEqual([1, "", ""]);
    expect(w.book.formula(PG, "L5")).toBeDefined();
    w.db.rows("replacements").push(replacementRow(9));
    w.sync();
    expect(cells(w, PG, 5, ["D", "P"])).toEqual(["Diganti 9", 9]);
    expectSteady(w);
  });

  test("all slots used: reported, never written below the block", () => {
    const w = world({ replacementSlots: 1 });
    w.db.rows("replacements").push(replacementRow(2, { station: "KNO" }));
    const { plan, ops } = w.sync();
    expect(tp(plan, "replacements").issues[0]).toMatchObject({ kind: "no_sheet_row", rowKey: "2" });
    expect(ops.writes.filter((x) => x.tab === PG && x.row > 5)).toEqual([]);
  });

  test("ID SDM must exist in Master SDM", () => {
    const w = world();
    w.book.set(PG, "Q5", "XXX-01");
    const { plan } = w.sync();
    expect(tp(plan, "replacements").issues[0]).toMatchObject({ kind: "unknown_parent", column: "staff_code" });
    expect(w.book.note(PG, "Q5")).toContain("tidak ada di Master SDM");
  });
});

// ------------------------------------------------------------------ Parameter

describe("Parameter (label in B, value in C)", () => {
  test("a value edited in C syncs; TODAY() in C30 is never touched", () => {
    const w = world();
    const r = w.book.findRow(PAR, "B", "Jumlah minggu pemantauan");
    w.book.set(PAR, `C${r}`, 12);
    const { ops } = w.sync();
    expect(w.db.rows("settings")[0].weeks).toBe(12);
    expect(ops.writes.some((x) => x.tab === PAR)).toBe(false);
    expect(w.book.formula(PAR, "C30")).toBe("=TODAY()");
    w.db.rows("settings")[0].bmi_interval_days = 7;
    w.db.rows("settings")[0].replacement_deadline = "2026-12-31";
    w.sync();
    expect(w.book.get(PAR, `C${w.book.findRow(PAR, "B", "Interval antar cek BMI (hari, semua petugas)")}`)).toBe(7);
    expect(w.book.get(PAR, `C${w.book.findRow(PAR, "B", "Batas waktu penggantian SDM")}`)).toBe(isoToSerial("2026-12-31"));
    expectSteady(w);
  });

  test("fractions stay fractions; a renamed label is reported and its value left alone", () => {
    const w = world();
    const r = w.book.findRow(PAR, "B", "Target ketepatan jawaban Product Knowledge");
    w.book.set(PAR, `C${r}`, 0.95);
    w.sync();
    expect(w.db.rows("settings")[0].target_knowledge).toBe(0.95);
    w.book.set(PAR, `B${w.book.findRow(PAR, "B", "Passing grade (skor ≥)")}`, "Passing grade");
    w.db.rows("settings")[0].pass_grade = 80;
    const { plan, ops } = w.sync();
    expect(tp(plan, "settings").issues[0]).toMatchObject({ kind: "no_sheet_row", rowKey: "pass_grade" });
    expect(ops.writes.some((x) => x.tab === PAR)).toBe(false);
    expect(w.db.rows("settings")[0].pass_grade).toBe(80);
  });
});

// ------------------------------------------------------------------ Temuan Mingguan

describe("Temuan Mingguan (engine-owned tab)", () => {
  test("created with its row-1 header and synced both ways; Lingkup is a station or KPS", () => {
    const w = world();
    w.book.set(TM, "C2", "Diperbarui di Sheet");
    w.book.set(TM, "A4", 2);
    w.book.set(TM, "B4", "upg");
    w.book.set(TM, "C4", "Temuan UPG");
    w.book.set(TM, "A5", 2);
    w.book.set(TM, "B5", "XYZ");
    w.book.set(TM, "C5", "unit tidak dikenal");
    const { plan } = w.sync();
    expect(w.db.find("weekly_reports", { week: 1, scope: "SUB" })!.findings).toBe("Diperbarui di Sheet");
    expect(w.db.find("weekly_reports", { week: 2, scope: "UPG" })!.findings).toBe("Temuan UPG");
    expect(tp(plan, "weekly_reports").issues.map((i) => `${i.kind}:${i.column}`)).toEqual(["invalid_value:scope"]);
  });
});

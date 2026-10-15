/* eslint-disable @typescript-eslint/no-explicit-any -- Sheets request objects are inspected loosely in these tests */
/**
 * Ready-to-use rows for new staff: the step prepares more rows in Master SDM and Cek BMI 2 Mingguan when
 * the free ones are running out, and does nothing while there are enough.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { RealOps, RealTab } from "../layouts";
import { RESERVE_ADD, RESERVE_MIN, planReserveRows, reconcileReserveRows, reserveEnabled } from "../reserve-rows";
import { runSync } from "../run";
import type { SheetsPort } from "../sheets";
import type { DbApplyResult, SyncStore } from "../supabase";
import { FakeDb } from "../testing/fakes";
import { smallDb } from "../testing/fixtures";
import { FakeWorkbook, buildWorkbook } from "../testing/workbook";
import type { Baseline, Plan } from "../types";

const MS = "Master SDM";
const BMI = "Cek BMI 2 Mingguan";

function tabs(masterFree: number) {
  const snap = buildWorkbook(smallDb(), { masterFree }).snapshot();
  return { master: structuredClone(snap.tabs[MS]!) as RealTab, bmi: structuredClone(snap.tabs[BMI]!) as RealTab, snap };
}

/** Rows (1-based) that hold no staff but are inside the block of formulas. */
const freeRows = (master: RealTab) => {
  const out: number[] = [];
  for (let r = 5; r <= master.values.length; r++) if (!master.values[r - 1]?.[1] && !master.values[r - 1]?.[5]) out.push(r);
  return out;
};

describe("planReserveRows", () => {
  test("a full Master SDM gets more rows, in both tabs, from the last row of each", () => {
    const { master, bmi } = tabs(0);
    expect(freeRows(master)).toEqual([]);
    const lastMaster = master.values.length;
    const plan = planReserveRows(master, bmi);
    expect(plan.blockers).toEqual([]);
    expect(plan.free).toBe(0);
    expect(plan.added).toBe(RESERVE_ADD);
    const req = plan.requests as Record<string, any>[];
    const pastes = req.filter((r) => r.copyPaste).map((r) => r.copyPaste);
    // Three kinds of paste per tab (formulas, looks, drop-downs): never "everything", so the notes are not copied.
    expect(pastes.map((p) => p.pasteType)).toEqual(["PASTE_FORMULA", "PASTE_FORMAT", "PASTE_DATA_VALIDATION", "PASTE_FORMULA", "PASTE_FORMAT", "PASTE_DATA_VALIDATION"]);
    const [m, b] = [pastes[0], pastes[3]];
    expect(m.source.startRowIndex).toBe(lastMaster - 1);
    expect(m.destination).toMatchObject({ startRowIndex: lastMaster, endRowIndex: lastMaster + RESERVE_ADD });
    expect(m.destination.sheetId).toBe(master.sheetId);
    // Cek BMI is one row lower: row = Master row + 1.
    expect(b.source.startRowIndex).toBe(lastMaster);
    expect(b.destination).toMatchObject({ startRowIndex: lastMaster + 1, endRowIndex: lastMaster + 1 + RESERVE_ADD });
    expect(b.destination.sheetId).toBe(bmi.sheetId);
  });

  test("the typed values of the copied row are cleared, formulas are not", () => {
    const { master, bmi } = tabs(0);
    const plan = planReserveRows(master, bmi);
    const cleared = (plan.requests as Record<string, any>[]).filter((r) => r.repeatCell).map((r) => r.repeatCell.range);
    const lastMaster = master.values.length;
    const masterClears = cleared.filter((r) => r.sheetId === master.sheetId);
    const typed: number[] = [];
    master.values[lastMaster - 1].forEach((v, c) => {
      const f = String(master.formulas[lastMaster - 1][c] ?? "");
      if (v !== "" && !f.startsWith("=")) typed.push(c);
    });
    const clearedCols = masterClears.flatMap((r) => Array.from({ length: r.endColumnIndex - r.startColumnIndex }, (_, i) => r.startColumnIndex + i));
    expect(clearedCols.sort((a, c) => a - c)).toEqual(typed);
    // ID SDM (B) and Nama Petugas (F) are among them, a formula column such as Final Result is not.
    expect(clearedCols).toContain(1);
    expect(clearedCols).toContain(5);
    for (const r of masterClears) expect([r.startRowIndex, r.endRowIndex]).toEqual([lastMaster, lastMaster + RESERVE_ADD]);
  });

  test("the new Cek BMI rows are numbered on from the last number", () => {
    const { master, bmi } = tabs(0);
    const lastNumber = Number(bmi.values[master.values.length]?.[0]);
    const plan = planReserveRows(master, bmi);
    const numbering = (plan.requests as Record<string, any>[]).find((r) => r.updateCells)!.updateCells;
    expect(numbering.range.sheetId).toBe(bmi.sheetId);
    expect(numbering.rows.map((r: any) => r.values[0].userEnteredValue.numberValue)).toEqual(Array.from({ length: RESERVE_ADD }, (_, i) => lastNumber + 1 + i));
  });

  test("enough free rows: nothing to do; fewer than the minimum: more rows", () => {
    expect(planReserveRows(tabs(RESERVE_MIN).master, tabs(RESERVE_MIN).bmi).requests).toEqual([]);
    expect(planReserveRows(tabs(RESERVE_MIN + 5).master, tabs(RESERVE_MIN + 5).bmi).requests).toEqual([]);
    const low = tabs(RESERVE_MIN - 1);
    expect(planReserveRows(low.master, low.bmi).requests.length).toBeGreaterThan(0);
  });

  test("the staff this run is about to place count against the free rows", () => {
    const { master, bmi } = tabs(RESERVE_MIN + 2);
    expect(planReserveRows(master, bmi, { pending: 2 }).requests).toEqual([]);
    expect(planReserveRows(master, bmi, { pending: 3 }).requests.length).toBeGreaterThan(0);
  });

  test("a grid too small for the new rows is made longer first", () => {
    const { master, bmi } = tabs(0);
    master.rowCount = master.values.length + 10;
    const plan = planReserveRows(master, bmi);
    const grow = (plan.requests as Record<string, any>[]).find((r) => r.appendDimension)!.appendDimension;
    expect(grow).toMatchObject({ sheetId: master.sheetId, dimension: "ROWS", length: RESERVE_ADD - 10 });
  });

  test("Cek BMI that does not mirror Master SDM is refused with a reason and nothing is written", () => {
    const { master, bmi } = tabs(0);
    const row = master.values.length; // the mirror of the last Master row sits one row lower
    bmi.formulas[row][1] = "=IF('Master SDM'!B3=\"\";\"\";'Master SDM'!B3)";
    const plan = planReserveRows(master, bmi);
    expect(plan.requests).toEqual([]);
    expect(plan.blockers[0]).toContain("tidak sejajar");
  });

  test("a Cek BMI block longer than Master SDM is refused too", () => {
    const { master, bmi } = tabs(0);
    const extra = bmi.values.length + 1;
    while (bmi.formulas.length < extra) bmi.formulas.push([]);
    while (bmi.values.length < extra) bmi.values.push([]);
    bmi.formulas[extra - 1][2] = "=1+1";
    expect(planReserveRows(master, bmi).blockers[0]).toContain("tidak sejajar");
  });

  test("a missing tab or header is left to the data sync to report", () => {
    const { master, bmi } = tabs(0);
    expect(planReserveRows(undefined, bmi)).toMatchObject({ requests: [], blockers: [] });
    expect(planReserveRows(master, undefined)).toMatchObject({ requests: [], blockers: [] });
    master.values[3][1] = "Kode";
    expect(planReserveRows(master, bmi)).toMatchObject({ requests: [], blockers: [] });
  });
});

describe("the step in a run", () => {
  class Store implements SyncStore {
    baseline: Baseline | null = null;
    lastError: string | null = null;
    constructor(public db: FakeDb) {}
    async claimLease() {
      return "lease";
    }
    async releaseLease(_t: string, baseline: Baseline | null, error: string | null) {
      if (baseline) this.baseline = JSON.parse(JSON.stringify(baseline));
      this.lastError = error;
      return true;
    }
    async readBaseline() {
      return this.baseline;
    }
    async readAll() {
      return this.db.snapshot();
    }
    async apply(plan: Plan): Promise<DbApplyResult> {
      return { ids: this.db.apply(plan), failed: new Map() };
    }
    async log() {}
  }
  class Port implements SheetsPort {
    batches: unknown[][] = [];
    constructor(public book: FakeWorkbook) {}
    async read() {
      return this.book.snapshot();
    }
    async apply(ops: RealOps, ids: Map<number, number | string>, opts: { skipTables?: Set<string> } = {}) {
      this.book.apply(ops, ids, opts.skipTables);
    }
    async batchUpdate(requests: unknown[]) {
      this.batches.push(requests);
    }
  }
  const setup = (masterFree: number) => {
    const data = smallDb();
    const db = new FakeDb(data);
    return { db, store: new Store(db), port: new Port(buildWorkbook(data, { masterFree })) };
  };
  const OLD = process.env.SYNC_RESERVE_ROWS;
  beforeEach(() => {
    delete process.env.SYNC_RESERVE_ROWS;
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.SYNC_RESERVE_ROWS;
    else process.env.SYNC_RESERVE_ROWS = OLD;
  });

  test("a run with few free rows prepares more and says so", async () => {
    const { store, port } = setup(3);
    const summary = await runSync({ store, sheets: port });
    expect(summary.status).toBe("ok");
    expect(summary.reserve?.applied).toBe(true);
    expect(summary.reserve?.added).toBe(RESERVE_ADD);
    expect(summary.reserve?.actions[0]).toContain("Siapkan 50 baris");
    expect(port.batches).toHaveLength(1);
  });

  test("a run with enough free rows writes nothing for it", async () => {
    const { store, port } = setup(RESERVE_MIN + 3);
    const summary = await runSync({ store, sheets: port });
    expect(summary.reserve?.applied).toBe(false);
    expect(port.batches).toEqual([]);
  });

  test("a new staff member takes a free row and the rows after it are prepared in the same run", async () => {
    const { store, port, db } = setup(RESERVE_MIN);
    db.rows("staff").push({ code: "UPG-77", name: "Petugas Baru", station: "SUB", assignment_status: "Aktif" } as never);
    const summary = await runSync({ store, sheets: port });
    expect(port.book.snapshot().tabs[MS]!.values.some((r) => r[1] === "UPG-77")).toBe(true);
    expect(summary.reserve?.applied).toBe(true); // 10 free rows, one used: 9 < 10
  });

  test("a full Master SDM: the new staff member waits one run, then lands in a prepared row", async () => {
    const { store, port, db } = setup(0);
    db.rows("staff").push({ code: "UPG-78", name: "Petugas Baru", station: "SUB", assignment_status: "Aktif" } as never);
    const first = await runSync({ store, sheets: port });
    expect(first.reserve?.applied).toBe(true);
    expect(port.book.snapshot().tabs[MS]!.values.some((r) => r[1] === "UPG-78")).toBe(false);
  });

  test("a dry run plans it and writes nothing", async () => {
    const { store, port } = setup(2);
    const summary = await runSync({ store, sheets: port }, { dryRun: true });
    expect(summary.status).toBe("dry-run");
    expect(summary.reserve?.applied).toBe(false);
    expect(summary.reserve?.actions.length).toBe(1);
    expect(port.batches).toEqual([]);
  });

  test("SYNC_RESERVE_ROWS=off leaves the rows alone", async () => {
    process.env.SYNC_RESERVE_ROWS = "off";
    expect(reserveEnabled()).toBe(false);
    expect(reserveEnabled({ SYNC_RESERVE_ROWS: "on" })).toBe(true);
    const { store, port } = setup(0);
    const summary = await runSync({ store, sheets: port });
    expect(summary.reserve).toBeUndefined();
    expect(port.batches).toEqual([]);
  });

  test("a port that cannot batchUpdate is left alone", async () => {
    const { store, port } = setup(0);
    port.batchUpdate = undefined as never;
    expect(await reconcileReserveRows(port, port.book.snapshot(), 0)).toBeNull();
    const summary = await runSync({ store, sheets: port });
    expect(summary.status).toBe("ok");
    expect(summary.reserve).toBeUndefined();
  });

  test("a sheet whose tabs do not line up is a run error, nothing is written", async () => {
    const { store, port } = setup(0);
    const snap = port.book.snapshot();
    const last = snap.tabs[MS]!.values.length;
    port.book.setAt(BMI, last + 1, 1, "x", "=IF('Master SDM'!B3=\"\";\"\";'Master SDM'!B3)");
    const summary = await runSync({ store, sheets: port });
    expect(summary.status).toBe("partial");
    expect(summary.errors?.join(" ")).toContain("tidak sejajar");
    expect(port.batches).toEqual([]);
  });
});

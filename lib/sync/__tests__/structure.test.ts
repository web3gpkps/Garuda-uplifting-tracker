/* eslint-disable @typescript-eslint/no-explicit-any -- Sheets request objects are inspected loosely in these tests */
/**
 * The structure step of a sync run: it follows the settings the run ended with, runs only on a port
 * that can batchUpdate, reports blockers as run errors, and can be switched off.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { RealOps } from "../layouts";
import { runSync } from "../run";
import type { SheetsPort } from "../sheets";
import { structureEnabled, structureSettings } from "../structure";
import type { DbApplyResult, SyncStore } from "../supabase";
import { FakeDb } from "../testing/fakes";
import { smallDb } from "../testing/fixtures";
import { FakeWorkbook, buildWorkbook } from "../testing/workbook";
import type { Baseline, Plan } from "../types";

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
  widthCalls: [string, number, number][] = [];
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
  async columnWidths(tab: string, from: number, count: number) {
    this.widthCalls.push([tab, from, count]);
    return Array.from({ length: count }, () => 90);
  }
}

function setup(periods?: number) {
  const data = smallDb();
  if (periods !== undefined) (data.settings as Record<string, unknown>[])[0].bmi_periods = periods;
  const db = new FakeDb(data);
  const store = new Store(db);
  const port = new Port(buildWorkbook(data));
  return { db, store, port };
}

beforeEach(() => {
  process.env.SYNC_BMI_STRUCTURE = "on";
});

afterEach(() => {
  delete process.env.SYNC_BMI_STRUCTURE;
});

describe("structure step of a run", () => {
  test("the first run converts the tab and reports what it did", async () => {
    const { store, port } = setup();
    const summary = await runSync({ store, sheets: port });
    expect(summary.status).toBe("ok");
    expect(summary.structure?.applied).toBe(true);
    expect(summary.structure?.actions.join(" ")).toContain("rumus ringkasan");
    expect(summary.structure?.actions.join(" ")).toContain("Touch Point");
    expect(port.batches).toHaveLength(1);
    // The widths of the last group are asked for so inserted groups look like it.
    expect(port.widthCalls).toEqual([["Cek BMI 2 Mingguan", 34, 5]]);
  });

  test("a higher number of checks in the database adds groups to the tab", async () => {
    const { store, port, db } = setup();
    await runSync({ store, sheets: port });
    port.batches.length = 0;
    (db.rows("settings")[0] as Record<string, unknown>).bmi_periods = 9;
    const summary = await runSync({ store, sheets: port });
    expect(summary.structure?.actions[0]).toContain("Tambah 3 kelompok kolom cek");
    expect(port.batches).toHaveLength(1);
    const insert = (port.batches[0] as Record<string, any>[]).find((r) => r.insertDimension)!.insertDimension;
    expect(insert.range.endIndex - insert.range.startIndex).toBe(15);
  });

  test("a dry run plans the change and applies nothing", async () => {
    const { store, port } = setup();
    const summary = await runSync({ store, sheets: port }, { dryRun: true });
    expect(summary.status).toBe("dry-run");
    expect(summary.structure?.applied).toBe(false);
    expect(summary.structure?.actions.length).toBeGreaterThan(0);
    expect(port.batches).toEqual([]);
  });

  test("a port that cannot batchUpdate leaves the structure alone", async () => {
    const { store, port } = setup();
    port.batchUpdate = undefined as never;
    const summary = await runSync({ store, sheets: port });
    expect(summary.status).toBe("ok");
    expect(summary.structure).toBeUndefined();
  });

  test("it only runs when SYNC_BMI_STRUCTURE is on", async () => {
    delete process.env.SYNC_BMI_STRUCTURE;
    expect(structureEnabled()).toBe(false);
    expect(structureEnabled({ SYNC_BMI_STRUCTURE: "on" })).toBe(true);
    expect(structureEnabled({ SYNC_BMI_STRUCTURE: "off" })).toBe(false);
    const { store, port } = setup();
    const summary = await runSync({ store, sheets: port });
    expect(summary.structure).toBeUndefined();
    expect(port.batches).toEqual([]);
  });

  test("a change that is refused is reported as a run error, not applied", async () => {
    const { store, port, db } = setup();
    await runSync({ store, sheets: port });
    port.batches.length = 0;
    // Data in the last group of the sheet, then fewer checks.
    const snap = port.book.snapshot().tabs["Cek BMI 2 Mingguan"]!;
    const row = snap.values.findIndex((r, i) => i >= 5 && r?.[1]);
    port.book.setAt("Cek BMI 2 Mingguan", row + 1, 35, 170);
    (db.rows("settings")[0] as Record<string, unknown>).bmi_periods = 5;
    const summary = await runSync({ store, sheets: port });
    expect(summary.status).toBe("partial");
    expect(summary.errors?.join(" ")).toContain("BMI Cek ke-6 masih berisi data");
    expect(port.batches).toEqual([]);
  });

  test("the settings come from the run's final values", () => {
    const base: Baseline = {
      v: 1,
      tables: {
        settings: {
          bmi_first_check: { key: "bmi_first_check", value: "2026-10-12" },
          bmi_interval_days: { key: "bmi_interval_days", value: 14 },
          bmi_periods: { key: "bmi_periods", value: 8 },
        },
      },
    };
    expect(structureSettings(base)).toEqual({ bmiFirstCheck: "2026-10-12", bmiIntervalDays: 14, bmiPeriods: 8 });
    expect(structureSettings({ v: 1, tables: {} })).toBeNull();
    for (const bad of [0, 53, 2.5, "x"]) {
      const b = JSON.parse(JSON.stringify(base)) as Baseline;
      (b.tables.settings!.bmi_periods as Record<string, unknown>).value = bad;
      expect(structureSettings(b)).toBeNull();
    }
  });
});

/**
 * Workbook layouts <-> the merge engine's row-1 tables.
 *
 * The replica is the Garuda workbook. Each synced table lives in a native tab (header on row 4,
 * a fixed block of pre-made rows, formulas between the inputs, Cek BMI in wide format, Parameter as
 * label/value). `projectAll` turns the real grid into one virtual row-1 table per synced table (what
 * lib/sync/merge.ts understands); `translate` turns the merge plan back into real cell writes.
 *
 * Generic rules:
 * - A cell holding a formula is never read as input and never written (it reaches the merge as
 *   `locked`; translate refuses to write it). Keys may come from formulas (their computed value).
 * - Untouched tabs (Petunjuk, Dashboard, Laporan Mingguan, Rekap Performa, Data Coaching,
 *   Data Training) are never written.
 * - Rows are never inserted or deleted in workbook tabs (Dashboard, Laporan, Rekap and Cek BMI refer
 *   to fixed ranges such as 'Master SDM'!B5:B304). The block of a tab runs from its first data row to
 *   the last row holding a formula; new records fill free rows inside it and are reported
 *   (`no_sheet_row`) when it is full. Deletes clear the record's input cells.
 */
import { isoToSerial, roundTo } from "./normalize";
import { SYNC_TABLES, UNTOUCHED_TABS, columnId } from "./tables";
import type { Canon, CellFormat, Plan, SheetSnapshot, SheetTab, SyncTable, TableSpec } from "./types";

// ------------------------------------------------------------------ real grid model

export interface RealTab {
  title: string;
  sheetId: number;
  /** values.batchGet with UNFORMATTED_VALUE + SERIAL_NUMBER dates. */
  values: unknown[][];
  /** values.batchGet with FORMULA: "=..." where the cell holds a formula. */
  formulas: unknown[][];
  rowCount: number;
  columnCount: number;
}

export interface RealSnapshot {
  tabs: Record<string, RealTab | undefined>;
  locale?: string;
  timeZone?: string;
}

/** 1-based row, 0-based column. */
export interface RealCell {
  tab: string;
  row: number;
  col: number;
}

export interface RealWrite extends RealCell {
  table: SyncTable;
  value: unknown;
  /** Write the DB id of pending insert `ref` (resolved after the DB writes). */
  ref?: number;
}

export interface RealOps {
  /** Engine-owned tabs to create (or a blank existing tab to lay out). */
  createTabs: { table: SyncTable; tab: string; spec: TableSpec; header: string[]; minRows: number; exists: boolean }[];
  /** Header cells the engine adds to a workbook tab (Penggantian SDM: ID Sistem, ID SDM). */
  headerCells: (RealCell & { table: SyncTable; text: string; hide?: boolean })[];
  writes: RealWrite[];
  notes: (RealCell & { table: SyncTable; text: string })[];
  /** Engine-owned tabs only. */
  deleteRows: { table: SyncTable; tab: string; rows: number[] }[];
  /** Engine-owned tabs only (values:append INSERT_ROWS). */
  appends: { table: SyncTable; tab: string; rows: unknown[][] }[];
}

export function emptyOps(): RealOps {
  return { createTabs: [], headerCells: [], writes: [], notes: [], deleteRows: [], appends: [] };
}

export function isFormulaCell(tab: RealTab | undefined, row: number, col: number): boolean {
  if (!tab) return false;
  const f = tab.formulas[row - 1]?.[col];
  return typeof f === "string" && f.startsWith("=") && f !== tab.values[row - 1]?.[col];
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const normHeader = (h: unknown) => String(h ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const lastRowOf = (t: RealTab) => Math.max(t.values.length, t.formulas.length);

function headerPositions(tab: RealTab, row: number): Map<string, number[]> {
  const out = new Map<string, number[]>();
  (tab.values[row - 1] ?? []).forEach((h, i) => {
    const k = normHeader(h);
    if (k) out.set(k, [...(out.get(k) ?? []), i]);
  });
  return out;
}

/** RAW encoding: dates as serial numbers (the workbook's date cells are pre-formatted), null clears. */
export function encodeRaw(value: Canon, fmt: CellFormat): unknown {
  if (value === null) return "";
  if (fmt === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return isoToSerial(value);
  return value;
}

interface Transform {
  read(raw: unknown): unknown;
  write(value: Canon): unknown;
}

/** Tindak Lanjut "% Progres": the sheet holds a fraction formatted 0%, the DB 0..100. */
export const PERCENT: Transform = {
  read(raw) {
    if (typeof raw === "number") return roundTo(raw * 100, 6);
    if (typeof raw === "string") {
      const t = raw.trim();
      const pct = /^(-?\d+(?:[.,]\d+)?)\s*%$/.exec(t);
      if (pct) return Number(pct[1].replace(",", "."));
      const n = /^-?\d+(?:[.,]\d+)?$/.test(t) ? Number(t.replace(",", ".")) : NaN;
      if (!Number.isNaN(n)) return roundTo(n * 100, 6);
    }
    return raw;
  },
  write(value) {
    return typeof value === "number" ? roundTo(value / 100, 6) : value === null ? "" : value;
  },
};

// ------------------------------------------------------------------ projections

export interface Placement {
  rows: number[];
  extraWrites: { row: number; col: number; value: unknown }[];
}

export interface Projection {
  spec: TableSpec;
  /** Tab the projection mostly lives in (for messages). */
  tab: string;
  error?: string;
  virtual?: SheetTab;
  /** Real cell behind a virtual cell; undefined for synthetic cells (e.g. Cek BMI slot number). */
  cell(vrow: number, colId: string): RealCell | undefined;
  encode(colId: string, value: Canon, fmt: CellFormat): unknown;
  /** Row-based layouts: the real cell of a column on a real row (for placing new records). */
  cellAt?(row: number, colId: string): RealCell | undefined;
  /** appendMode "blank-row": the free rows n new records go to (never more than `virtual.capacity`). */
  place?(n: number): Placement;
  /** Header cells to add before writing (missing engine columns). */
  setup: { row: number; col: number; text: string; hide?: boolean }[];
  /** True when the virtual tab mirrors the real tab 1:1 (engine-owned row-1 tab). */
  identity?: boolean;
}

function failed(spec: TableSpec, tab: string, error: string): Projection {
  return { spec, tab, error, cell: () => undefined, encode: (_c, v, f) => encodeRaw(v, f), setup: [] };
}

const missingTab = (spec: TableSpec, title: string) =>
  failed(spec, title, `Tab "${title}" tidak ditemukan di Google Sheet. Tabel ini tidak disinkronkan.`);

/** Last row of a tab's fixed block: the last row (from `firstDataRow`) that holds any formula. */
export function blockEnd(tab: RealTab, firstDataRow: number): number {
  for (let r = lastRowOf(tab); r >= firstDataRow; r--) {
    const width = Math.max(tab.values[r - 1]?.length ?? 0, tab.formulas[r - 1]?.length ?? 0);
    for (let c = 0; c < width; c++) if (isFormulaCell(tab, r, c)) return r;
  }
  return firstDataRow - 1;
}

interface RowLayoutConfig {
  headerRow: number;
  firstDataRow: number;
  /** Columns the engine adds to the right of the header when missing. */
  addable?: string[];
  transforms?: Record<string, Transform>;
  /** Column A holds a running number ("No"); a free row without one gets the next number. */
  numbered?: boolean;
  /** Columns that must be blank for a row to count as free (default: every synced column). */
  freeWhenBlank?: string[];
  /** Columns that live in another tab, located from the real row of the record. */
  external?: Record<string, (row: number) => { cell?: RealCell; tab?: RealTab }>;
}

function rowLayout(spec: TableSpec, real: RealSnapshot, cfg: RowLayoutConfig): Projection {
  const tab = real.tabs[spec.tab];
  if (!tab) return missingTab(spec, spec.tab);

  const positions = headerPositions(tab, cfg.headerRow);
  const lastHeaderCol = Math.max(-1, ...[...positions.values()].flat());
  const colOf: Record<string, number> = {};
  const setup: Projection["setup"] = [];
  const missing: string[] = [];
  const dup: string[] = [];
  let nextFree = lastHeaderCol + 1;
  for (const c of spec.columns) {
    if (cfg.external?.[c.db]) continue;
    const hits = positions.get(normHeader(c.header)) ?? [];
    if (hits.length === 1) colOf[c.db] = hits[0];
    else if (hits.length === 0 && cfg.addable?.includes(c.db)) {
      colOf[c.db] = nextFree++;
      setup.push({ row: cfg.headerRow, col: colOf[c.db], text: c.header, hide: c.hidden });
    } else (hits.length === 0 ? missing : dup).push(c.header);
  }
  if (missing.length || dup.length) {
    const parts = [];
    if (missing.length) parts.push(`kolom tidak ditemukan di baris ${cfg.headerRow}: ${missing.map((m) => `"${m}"`).join(", ")}`);
    if (dup.length) parts.push(`kolom ganda: ${dup.map((m) => `"${m}"`).join(", ")}`);
    return failed(spec, spec.tab, `Tab "${spec.tab}": ${parts.join("; ")}. Tabel ini tidak disinkronkan sampai header diperbaiki.`);
  }

  const last = lastRowOf(tab);
  const header = spec.columns.map((c) => c.header);
  const values: unknown[][] = [header];
  const locked = new Set<string>();
  const vrowOf = (r: number) => r - cfg.firstDataRow + 2;
  const rowOfV = (v: number) => v + cfg.firstDataRow - 2;

  for (let r = cfg.firstDataRow; r <= last; r++) {
    const v = vrowOf(r);
    const out: unknown[] = [];
    spec.columns.forEach((c, i) => {
      const ext = cfg.external?.[c.db];
      if (ext) {
        const where = ext(r);
        if (!where.cell || isFormulaCell(where.tab, where.cell.row, where.cell.col)) {
          locked.add(`${v}:${i}`);
          out.push(undefined);
        } else out.push(where.tab!.values[where.cell.row - 1]?.[where.cell.col]);
        return;
      }
      const col = colOf[c.db];
      const raw = tab.values[r - 1]?.[col];
      if (isFormulaCell(tab, r, col) && !spec.key.includes(c.db)) locked.add(`${v}:${i}`);
      out.push(cfg.transforms?.[c.db] ? cfg.transforms[c.db].read(raw) : raw);
    });
    values.push(out);
  }

  // Free rows inside the fixed block (never below it: other tabs only see the block's range).
  const end = blockEnd(tab, cfg.firstDataRow);
  const freeCols = (cfg.freeWhenBlank ?? spec.columns.filter((c) => !cfg.external?.[c.db]).map((c) => c.db)).map((id) => colOf[id]);
  const freeRows: number[] = [];
  for (let r = cfg.firstDataRow; r <= end; r++) {
    if (freeCols.every((c) => isBlank(tab.values[r - 1]?.[c]) && !isFormulaCell(tab, r, c))) freeRows.push(r);
  }
  const cellAt = (row: number, colId: string): RealCell | undefined => {
    if (cfg.external?.[colId]) return cfg.external[colId](row).cell;
    return colOf[colId] === undefined ? undefined : { tab: spec.tab, row, col: colOf[colId] };
  };

  return {
    spec,
    tab: spec.tab,
    virtual: { title: spec.tab, sheetId: tab.sheetId, values, locked, capacity: freeRows.length },
    setup,
    cellAt,
    cell: (vrow, colId) => cellAt(rowOfV(vrow), colId),
    encode(colId, value, fmt) {
      return cfg.transforms?.[colId] ? cfg.transforms[colId].write(value) : encodeRaw(value, fmt);
    },
    place(n) {
      if (n > freeRows.length) throw new LayoutViolation(`${spec.table}: only ${freeRows.length} free rows in "${spec.tab}", ${n} needed.`);
      const rows = freeRows.slice(0, n);
      const extraWrites: Placement["extraWrites"] = [];
      if (cfg.numbered) {
        let no = 0;
        for (let r = cfg.firstDataRow; r <= last; r++) {
          const a = tab.values[r - 1]?.[0];
          if (typeof a === "number") no = Math.max(no, a);
        }
        for (const r of rows) if (isBlank(tab.values[r - 1]?.[0]) && !isFormulaCell(tab, r, 0)) extraWrites.push({ row: r, col: 0, value: ++no });
      }
      return { rows, extraWrites };
    },
  };
}

/**
 * Cek BMI 2 Mingguan: one row per staff (data from row 6, row = Master SDM row + 1, B computed from
 * Master SDM), slots side by side (Tgl Cek, Tinggi, Berat, then the BMI/Kategori formulas).
 */
function cekBmiLayout(spec: TableSpec, real: RealSnapshot): Projection {
  const title = spec.tab;
  const tab = real.tabs[title];
  if (!tab) return missingTab(spec, title);
  const g = bmiGeometry(tab);
  if ("error" in g) return failed(spec, title, `Tab "${title}": ${g.error} Tabel ini tidak disinkronkan sampai header diperbaiki.`);

  const header = spec.columns.map((c) => c.header);
  const idx = Object.fromEntries(spec.columns.map((c, i) => [c.db, i]));
  const values: unknown[][] = [header];
  const locked = new Set<string>();
  const where = new Map<number, { row: number; slot: number }>();
  const offsets: Record<string, number> = { check_date: 0, height_cm: 1, weight_kg: 2 };
  for (let r = g.firstDataRow; r <= lastRowOf(tab); r++) {
    const code = tab.values[r - 1]?.[g.keyCol];
    if (isBlank(code)) continue;
    g.slots.forEach((start, i) => {
      const v = values.length + 1;
      const out: unknown[] = new Array(header.length);
      out[idx.staff_code] = code;
      out[idx.period] = i + 1;
      locked.add(`${v}:${idx.staff_code}`);
      locked.add(`${v}:${idx.period}`);
      for (const [colId, off] of Object.entries(offsets)) {
        out[idx[colId]] = tab.values[r - 1]?.[start + off];
        if (isFormulaCell(tab, r, start + off)) locked.add(`${v}:${idx[colId]}`);
      }
      values.push(out);
      where.set(v, { row: r, slot: i });
    });
  }

  return {
    spec,
    tab: title,
    virtual: { title, sheetId: tab.sheetId, values, locked },
    setup: [],
    cell(vrow, colId) {
      const w = where.get(vrow);
      if (!w || offsets[colId] === undefined) return undefined;
      return { tab: title, row: w.row, col: g.slots[w.slot] + offsets[colId] };
    },
    encode: (_c, v, f) => encodeRaw(v, f),
  };
}

export const BMI_TAB = "Cek BMI 2 Mingguan";

interface BmiGeometry {
  firstDataRow: number;
  keyCol: number;
  /** "Ada Catatan BMI" (staff.bmi_has_note). */
  hasNoteCol: number;
  /** "Catatan Program Kebugaran" (staff.bmi_note). */
  noteCol: number;
  /** Start column (Tgl Cek) of each slot. */
  slots: number[];
}

function bmiGeometry(tab: RealTab): BmiGeometry | { error: string } {
  const top = headerPositions(tab, 4);
  const sub = (tab.values[4] ?? []).map(normHeader);
  const one = (h: string) => top.get(normHeader(h)) ?? [];
  const [keyCols, hasNoteCols, noteCols] = [one("ID SDM"), one("Ada Catatan BMI"), one("Catatan Program Kebugaran")];
  const slots: number[] = [];
  sub.forEach((h, c) => {
    if (h === "tgl cek" && sub[c + 1] === "tinggi (cm)" && sub[c + 2] === "berat (kg)") slots.push(c);
  });
  const missing = [
    keyCols.length !== 1 && '"ID SDM"',
    hasNoteCols.length !== 1 && '"Ada Catatan BMI"',
    noteCols.length !== 1 && '"Catatan Program Kebugaran"',
  ].filter(Boolean);
  if (missing.length) return { error: `kolom ${missing.join(", ")} tidak ditemukan (atau ganda) di baris 4.` };
  if (slots.length === 0) return { error: 'kolom "Tgl Cek / Tinggi (cm) / Berat (kg)" tidak ditemukan di baris 5.' };
  return { firstDataRow: 6, keyCol: keyCols[0], hasNoteCol: hasNoteCols[0], noteCol: noteCols[0], slots };
}

/**
 * The Cek BMI row of a Master SDM row (Master row + 1), only if its ID SDM cell really mirrors that
 * Master row (`='Master SDM'!B<row>` or the same computed value): a sorted or edited BMI tab is never
 * written by position.
 */
function bmiRowFor(bmi: RealTab, geo: BmiGeometry, master: RealTab, masterKeyCol: number, row: number): number | undefined {
  const r = row + 1;
  const f = bmi.formulas[r - 1]?.[geo.keyCol];
  if (typeof f === "string" && new RegExp(`'?Master SDM'?!\\$?B\\$?${row}(?!\\d)`).test(f)) return r;
  const key = master.values[row - 1]?.[masterKeyCol];
  return !isBlank(key) && String(bmi.values[r - 1]?.[geo.keyCol] ?? "") === String(key) ? r : undefined;
}

/** Parameter: label in column B, value in column C (rows 5..), matched by label text. */
function parameterLayout(spec: TableSpec, real: RealSnapshot): Projection {
  const title = spec.tab;
  const tab = real.tabs[title];
  if (!tab) return missingTab(spec, title);
  const top = headerPositions(tab, 4);
  const labelCols = top.get("parameter") ?? [];
  const valueCols = top.get("nilai") ?? [];
  if (labelCols.length !== 1 || valueCols.length !== 1) {
    return failed(spec, title, `Tab "${title}": kolom "Parameter" / "Nilai" tidak ditemukan di baris 4. Tabel ini tidak disinkronkan.`);
  }
  const [lc, vc] = [labelCols[0], valueCols[0]];
  const byLabel = new Map(spec.kv!.entries.flatMap((e) => [e.label, ...(e.aliases ?? [])].map((l) => [normHeader(l), e.key] as const)));
  const values: unknown[][] = [spec.columns.map((c) => c.header)];
  const locked = new Set<string>();
  const rowOfV = new Map<number, number>();
  for (let r = 5; r <= lastRowOf(tab); r++) {
    const key = byLabel.get(normHeader(tab.values[r - 1]?.[lc]));
    if (!key) continue;
    const v = values.length + 1;
    values.push([key, tab.values[r - 1]?.[vc]]);
    locked.add(`${v}:0`);
    if (isFormulaCell(tab, r, vc)) locked.add(`${v}:1`);
    rowOfV.set(v, r);
  }
  return {
    spec,
    tab: title,
    virtual: { title, sheetId: tab.sheetId, values, locked },
    setup: [],
    cell(vrow, colId) {
      const r = rowOfV.get(vrow);
      return r !== undefined && colId === "value" ? { tab: title, row: r, col: vc } : undefined;
    },
    encode: (_c, v, f) => encodeRaw(v, f),
  };
}

/** Engine-owned row-1 tab: virtual == real. */
function identityLayout(spec: TableSpec, real: RealSnapshot): Projection {
  const tab = real.tabs[spec.tab];
  const locked = new Set<string>();
  if (tab) {
    for (let r = 1; r <= lastRowOf(tab); r++) {
      const width = Math.max(tab.values[r - 1]?.length ?? 0, tab.formulas[r - 1]?.length ?? 0);
      for (let c = 0; c < width; c++) if (isFormulaCell(tab, r, c)) locked.add(`${r}:${c}`);
    }
  }
  return {
    spec,
    tab: spec.tab,
    identity: true,
    virtual: tab ? { title: tab.title, sheetId: tab.sheetId, values: tab.values, locked } : undefined,
    setup: [],
    cell: () => undefined,
    encode: (_c, v, f) => encodeRaw(v, f),
  };
}

export function project(spec: TableSpec, real: RealSnapshot): Projection {
  switch (spec.layout) {
    case "master-sdm":
      return masterLayout(spec, real);
    case "log-performa":
      return rowLayout(spec, real, { headerRow: 4, firstDataRow: 5 });
    case "tindak-lanjut":
      return rowLayout(spec, real, { headerRow: 4, firstDataRow: 5, numbered: true, transforms: { progress: PERCENT } });
    case "remedial":
      return rowLayout(spec, real, { headerRow: 4, firstDataRow: 5, numbered: true });
    case "penggantian":
      return rowLayout(spec, real, { headerRow: 4, firstDataRow: 5, numbered: true, addable: ["id", "staff_code"] });
    case "cek-bmi":
      return cekBmiLayout(spec, real);
    case "parameter":
      return parameterLayout(spec, real);
    default:
      return identityLayout(spec, real);
  }
}

/**
 * Master SDM: header row 4, data 5..304. Free row = ID SDM and Nama Petugas both empty. The BMI flag
 * and note are cells of Cek BMI 2 Mingguan (I, AU) on the row below; when that tab's layout is broken
 * they are left alone (locked) and the rest of Master SDM still syncs.
 */
function masterLayout(spec: TableSpec, real: RealSnapshot): Projection {
  const master = real.tabs[spec.tab];
  const bmi = real.tabs[BMI_TAB];
  const geo = bmi ? bmiGeometry(bmi) : undefined;
  const keyCol = master ? (headerPositions(master, 4).get(normHeader("ID SDM")) ?? [])[0] : undefined;
  const ext = (col: (g: BmiGeometry) => number) => (row: number) => {
    if (!master || !bmi || !geo || "error" in geo || keyCol === undefined) return {};
    const r = bmiRowFor(bmi, geo, master, keyCol, row);
    return r === undefined ? {} : { cell: { tab: BMI_TAB, row: r, col: col(geo) }, tab: bmi };
  };
  return rowLayout(spec, real, {
    headerRow: 4,
    firstDataRow: 5,
    numbered: true,
    freeWhenBlank: ["code", "name"],
    external: { bmi_has_note: ext((g) => g.hasNoteCol), bmi_note: ext((g) => g.noteCol) },
  });
}

/** Real grid -> virtual snapshot for the merge, plus the projections needed to translate back. */
export function projectAll(real: RealSnapshot, specs: TableSpec[] = SYNC_TABLES) {
  const projections = new Map<SyncTable, Projection>();
  const sheet: SheetSnapshot = { tabs: {}, errors: {}, locale: real.locale, timeZone: real.timeZone };
  for (const spec of specs) {
    const p = project(spec, real);
    projections.set(spec.table, p);
    if (p.error) sheet.errors![spec.tab] = p.error;
    else if (p.virtual) sheet.tabs[spec.tab] = p.virtual;
  }
  return { sheet, projections };
}

/** Tabs the adapter must read (synced tabs + Cek BMI for the staff BMI flag and note). */
export function tabsToRead(specs: TableSpec[] = SYNC_TABLES): string[] {
  const tabs = new Set(specs.map((s) => s.tab));
  if (specs.some((s) => s.layout === "master-sdm")) tabs.add(BMI_TAB);
  return [...tabs];
}

// ------------------------------------------------------------------ plan -> real ops

export class LayoutViolation extends Error {}

/**
 * Translate a merge plan into real operations. Throws LayoutViolation (before anything is written)
 * if the plan would touch a formula cell, an untouched tab, or delete rows in a workbook tab.
 */
export function translate(
  plan: Plan,
  projections: Map<SyncTable, Projection>,
  real: RealSnapshot,
  opts: { skipTables?: Set<string> } = {},
): RealOps {
  const ops = emptyOps();
  for (const tp of plan.tables) {
    if (tp.error || opts.skipTables?.has(tp.table)) continue;
    const proj = projections.get(tp.table);
    if (!proj) continue;
    const spec = proj.spec;
    const table = tp.table;
    const s = tp.sheet;
    const colIdAt = (vcol: number) => (proj.identity ? Object.entries(s.colIndex).find(([, i]) => i === vcol)?.[0] : columnId(spec.columns[vcol]));

    if (proj.identity) {
      const fresh = s.create || s.writeHeader;
      if (fresh) ops.createTabs.push({ table, tab: s.tab, spec, header: s.header, minRows: s.appends.length + 200, exists: !s.create });
      for (const u of s.updates) ops.writes.push({ table, tab: s.tab, row: u.row, col: u.col, value: encodeRaw(u.value, u.fmt) });
      for (const w of s.idWrites) ops.writes.push({ table, tab: s.tab, row: w.row, col: w.col, value: null, ref: w.ref });
      for (const n of s.notes) ops.notes.push({ table, tab: s.tab, row: n.row, col: n.col, text: n.text });
      if (s.deleteRows.length) ops.deleteRows.push({ table, tab: s.tab, rows: [...s.deleteRows] });
      if (fresh) {
        s.appends.forEach((row, i) => row.forEach((c, col) => ops.writes.push({ table, tab: s.tab, row: i + 2, col, value: encodeRaw(c.value, c.fmt) })));
      } else if (s.appends.length) {
        ops.appends.push({ table, tab: s.tab, rows: s.appends.map((row) => row.map((c) => encodeRaw(c.value, c.fmt))) });
      }
      continue;
    }

    if (s.deleteRows.length) throw new LayoutViolation(`${table}: row deletes are not allowed in workbook tab "${proj.tab}".`);
    for (const h of proj.setup) ops.headerCells.push({ table, tab: proj.tab, ...h });
    for (const u of s.updates) {
      const colId = colIdAt(u.col)!;
      const cell = proj.cell(u.row, colId);
      if (cell) ops.writes.push({ table, ...cell, value: proj.encode(colId, u.value, u.fmt) });
    }
    for (const w of s.idWrites) {
      const cell = proj.cell(w.row, colIdAt(w.col)!);
      if (cell) ops.writes.push({ table, ...cell, value: null, ref: w.ref });
    }
    for (const n of s.notes) {
      const cell = proj.cell(n.row, colIdAt(n.col)!);
      if (cell) ops.notes.push({ table, ...cell, text: n.text });
    }
    if (s.appends.length) {
      if (!proj.place || !proj.cellAt) throw new LayoutViolation(`${table}: no room for new rows in "${proj.tab}".`);
      const placement = proj.place(s.appends.length);
      s.appends.forEach((row, i) => {
        const r = placement.rows[i];
        row.forEach((c, vcol) => {
          const colId = colIdAt(vcol)!;
          const cell = proj.cellAt!(r, colId);
          if (cell && c.value !== null) ops.writes.push({ table, ...cell, value: proj.encode(colId, c.value, c.fmt) });
        });
      });
      for (const w of placement.extraWrites) ops.writes.push({ table, tab: proj.tab, ...w });
    }
  }

  // Safety: never an untouched tab, never a formula cell.
  for (const w of [...ops.writes, ...ops.notes, ...ops.headerCells]) {
    if (UNTOUCHED_TABS.includes(w.tab)) throw new LayoutViolation(`write to untouched tab "${w.tab}"`);
  }
  for (const w of ops.writes) {
    if (isFormulaCell(real.tabs[w.tab], w.row, w.col)) {
      throw new LayoutViolation(`write to a formula cell in "${w.tab}" (row ${w.row}, column ${w.col + 1})`);
    }
  }
  return ops;
}

/** Counts of real operations, for summaries. */
export function countOps(ops: RealOps) {
  return {
    createTabs: ops.createTabs.map((t) => t.tab),
    headerCells: ops.headerCells.length,
    cellWrites: ops.writes.length,
    notes: ops.notes.length,
    rowDeletes: ops.deleteRows.reduce((n, d) => n + d.rows.length, 0),
    appends: ops.appends.reduce((n, a) => n + a.rows.length, 0),
    tabsWritten: [...new Set([...ops.writes, ...ops.headerCells, ...ops.notes].map((w) => w.tab))],
  };
}

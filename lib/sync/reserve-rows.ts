/**
 * Ready-to-use rows for new staff in the Google Sheet.
 *
 * A staff member added on the website is written into a "free row" of Master SDM: a row inside the block
 * of formulas whose ID SDM and Nama Petugas are empty. The row below it in Cek BMI 2 Mingguan (Master row
 * + 1) mirrors it with formulas, so the person shows up there and their BMI is computed. The sync never
 * inserts rows or formulas by itself in the data, so when the last free row is used the next new staff
 * member is kept in the database only ("Master SDM penuh") until someone prepares more rows.
 *
 * This step prepares them: when fewer than RESERVE_MIN free rows are left after the run's own additions,
 * it copies the formulas, formats and drop-downs of the last row of each tab down RESERVE_ADD more rows
 * (Master SDM rows r.., Cek BMI rows r+1..), empties the typed values of the copy and numbers the new
 * Cek BMI rows. Existing rows are never touched. Planning is pure; reconcileReserveRows applies it.
 * Set SYNC_RESERVE_ROWS=off to switch the step off.
 */
import { blockEnd, isFormulaCell, type RealSnapshot, type RealTab } from "./layouts";
import type { SheetsPort } from "./sheets";

export const MASTER_TAB = "Master SDM";
export const BMI_TAB_NAME = "Cek BMI 2 Mingguan";
/** Fewer free rows than this (after this run's new staff) and more rows are prepared. */
export const RESERVE_MIN = 10;
/** Rows prepared each time. */
export const RESERVE_ADD = 50;

const MASTER_FIRST_ROW = 5;
const norm = (h: unknown) => String(h ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

export interface ReservePlan {
  requests: unknown[];
  actions: string[];
  blockers: string[];
  /** Free rows left in Master SDM before the step (not counting what this run is about to place). */
  free: number;
  /** Rows added to each tab. */
  added: number;
}

export interface ReserveSummary {
  free: number;
  added: number;
  actions: string[];
  blockers: string[];
  applied: boolean;
}

export function reserveEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SYNC_RESERVE_ROWS !== "off";
}

const range = (sheetId: number, startRow: number, rows: number, startCol: number, cols: number) => ({
  sheetId,
  startRowIndex: startRow,
  endRowIndex: startRow + rows,
  startColumnIndex: startCol,
  endColumnIndex: startCol + cols,
});

/** Cells of a 1-based row that hold a typed value (not a formula): they are cleared after a copy. */
function typedColumns(tab: RealTab, row: number): number[] {
  const width = Math.max(tab.values[row - 1]?.length ?? 0, tab.formulas[row - 1]?.length ?? 0);
  const out: number[] = [];
  for (let c = 0; c < width; c++) {
    if (!isFormulaCell(tab, row, c) && !blank(tab.values[row - 1]?.[c])) out.push(c);
  }
  return out;
}

/** Runs of neighbouring columns as [start, length]. */
function runs(columns: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const c of columns) {
    const last = out[out.length - 1];
    if (last && last[0] + last[1] === c) last[1] += 1;
    else out.push([c, 1]);
  }
  return out;
}

/** The requests that extend `tab` by `count` rows below its block, copying row `source` (1-based). */
function extend(tab: RealTab, source: number, count: number, numbers?: { col: number; first: number }): unknown[] {
  const requests: unknown[] = [];
  const first = source + 1;
  const last = source + count;
  if (last > tab.rowCount) {
    requests.push({ appendDimension: { sheetId: tab.sheetId, dimension: "ROWS", length: last - tab.rowCount } });
  }
  const width = Math.max(tab.columnCount, tab.values[source - 1]?.length ?? 0, tab.formulas[source - 1]?.length ?? 0);
  // Formulas, looks and drop-downs, but not the notes the sync put on the source row.
  for (const pasteType of ["PASTE_FORMULA", "PASTE_FORMAT", "PASTE_DATA_VALIDATION"]) {
    requests.push({
      copyPaste: {
        source: range(tab.sheetId, source - 1, 1, 0, width),
        destination: range(tab.sheetId, first - 1, count, 0, width),
        pasteType,
        pasteOrientation: "NORMAL",
      },
    });
  }
  // The copy carried the typed values of the source row: a free row has none.
  for (const [start, length] of runs(typedColumns(tab, source))) {
    requests.push({ repeatCell: { range: range(tab.sheetId, first - 1, count, start, length), cell: {}, fields: "userEnteredValue" } });
  }
  if (numbers) {
    requests.push({
      updateCells: {
        range: range(tab.sheetId, first - 1, count, numbers.col, 1),
        rows: Array.from({ length: count }, (_, i) => ({ values: [{ userEnteredValue: { numberValue: numbers.first + i } }] })),
        fields: "userEnteredValue",
      },
    });
  }
  return requests;
}

/**
 * Plan the extra rows from a snapshot. `pending` is how many new staff members this run is about to place
 * in free rows. `add` and `min` are for tests and for the first preparation of a large reserve.
 */
export function planReserveRows(
  master: RealTab | undefined,
  bmi: RealTab | undefined,
  opts: { pending?: number; add?: number; min?: number } = {},
): ReservePlan {
  const plan: ReservePlan = { requests: [], actions: [], blockers: [], free: 0, added: 0 };
  if (!master || !bmi) return plan; // a missing tab is reported by the data sync itself

  const header = master.values[3] ?? [];
  const idCol = header.findIndex((h) => norm(h) === "id sdm");
  const nameCol = header.findIndex((h) => norm(h) === "nama petugas");
  if (idCol < 0 || nameCol < 0) return plan; // Master SDM's own layout error is reported by the data sync

  const end = blockEnd(master, MASTER_FIRST_ROW);
  const bmiEnd = blockEnd(bmi, MASTER_FIRST_ROW + 1);
  let free = 0;
  for (let r = MASTER_FIRST_ROW; r <= end; r++) {
    if (blank(master.values[r - 1]?.[idCol]) && blank(master.values[r - 1]?.[nameCol])) free++;
  }
  plan.free = free;
  const min = opts.min ?? RESERVE_MIN;
  if (free - (opts.pending ?? 0) >= min) return plan;

  if (end < MASTER_FIRST_ROW) return plan;
  // Cek BMI row = Master row + 1 and it must mirror it, or a copy would put formulas where nothing lines up.
  const mirror = String(bmi.formulas[end]?.[1] ?? "");
  if (bmiEnd !== end + 1 || !new RegExp(`'?Master SDM'?!\\$?B\\$?${end}(?!\\d)`).test(mirror)) {
    plan.blockers.push(
      `Baris cadangan SDM tidak ditambahkan: tab ${BMI_TAB_NAME} tidak sejajar dengan ${MASTER_TAB} (baris terakhir ${MASTER_TAB} ${end}, ${BMI_TAB_NAME} ${bmiEnd}). Periksa kedua tab.`,
    );
    return plan;
  }

  const add = opts.add ?? RESERVE_ADD;
  const lastNumber = Number(bmi.values[end]?.[0]);
  plan.requests.push(...extend(master, end, add));
  plan.requests.push(...extend(bmi, end + 1, add, { col: 0, first: Number.isFinite(lastNumber) ? lastNumber + 1 : end - MASTER_FIRST_ROW + 2 }));
  plan.added = add;
  plan.actions.push(
    `Siapkan ${add} baris kosong untuk SDM baru di ${MASTER_TAB} (baris ${end + 1}-${end + add}) dan ${BMI_TAB_NAME} (baris ${end + 2}-${end + add + 1}); sisa baris kosong tadinya ${free}.`,
  );
  return plan;
}

/**
 * Prepare the rows when they are running out. Needs a port that can run batchUpdate (the in-memory fakes
 * can not and are left alone). `real` is the snapshot the run read; `pending` the staff it is about to place.
 */
export async function reconcileReserveRows(
  sheets: SheetsPort,
  real: RealSnapshot,
  pending: number,
  opts: { dryRun?: boolean; add?: number; min?: number } = {},
): Promise<ReserveSummary | null> {
  if (!sheets.batchUpdate) return null;
  const plan = planReserveRows(real.tabs[MASTER_TAB], real.tabs[BMI_TAB_NAME], { pending, add: opts.add, min: opts.min });
  if (plan.requests.length > 0 && !opts.dryRun) await sheets.batchUpdate(plan.requests);
  return { free: plan.free, added: plan.added, actions: plan.actions, blockers: plan.blockers, applied: plan.requests.length > 0 && !opts.dryRun };
}

/**
 * The structure of the Google Sheet tab "Cek BMI 2 Mingguan" follows Parameter (public.settings):
 *
 *   - Jumlah cek (bmi_periods): the tab has one group of five columns per check (Tgl Cek, Tinggi,
 *     Berat, BMI, Kategori). More checks insert columns after the last group, copying its formats,
 *     formulas and validation; fewer checks delete the trailing groups (refused while one of them
 *     still holds data).
 *   - Interval (bmi_interval_days) and first check date: every group's header reads
 *     "BMI Cek ke-N (Periode 12-25 Oct 2026)", the same label the app shows (lib/bmi-periods.ts).
 *   - The summary columns (Jumlah Cek ... Kategori Terakhir, Delta Berat, Cek Berikutnya, and the two
 *     columns the Laporan reads) are rewritten for the new number of groups. They use a fixed-size
 *     formula over the whole block of groups (a MOD mask picks the column kind), so a tab with
 *     52 checks needs no deeper formula than one with 6.
 *   - Column E reads Touch Point (mirrors Master SDM column I) instead of Program.
 *   - Texts that described the old rhythm (per two weeks with a note, monthly without) are updated.
 *
 * planBmiStructure() is pure: it reads a snapshot of the tabs and returns Sheets API batchUpdate
 * requests plus a readable list of what it does. It is idempotent: when the tab already matches the
 * settings it returns no requests. Dashboard and Laporan formulas that point at the summary columns
 * follow the insertion or deletion by themselves (Sheets rewrites references).
 */
import { bmiCheckLabels } from "../bmi-periods";
import type { IsoDate } from "../dates";
import { blockEnd, type RealTab } from "./layouts";

export const BMI_SHEET = "Cek BMI 2 Mingguan";
export const SLOT_WIDTH = 5;
/** Offsets inside a group: Tgl Cek, Tinggi, Berat, BMI, Kategori. */
const OFF = { date: 0, height: 1, weight: 2, bmi: 3, category: 4 } as const;

const FIRST_DATA_ROW = 6;
const TOUCH_POINT_COL = 4; // E
const norm = (h: unknown) => String(h ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Spreadsheet column letters of a 0-based index. */
export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface BmiStructureSettings {
  bmiFirstCheck: IsoDate;
  bmiIntervalDays: number;
  bmiPeriods: number;
}

export interface BmiStructureInput {
  bmi: RealTab;
  /** Parameter: its labels are renamed (interval for everyone). */
  parameter?: RealTab;
  /** Laporan Mingguan: "Slot cek BMI terkait" (C6, D6) follows the interval. */
  laporan?: RealTab;
  /** Petunjuk: one sentence about the old rhythm. */
  petunjuk?: RealTab;
  settings: BmiStructureSettings;
  /** Pixel widths of the five columns of the last existing group, applied to inserted groups. */
  lastGroupWidths?: number[];
}

export interface BmiStructurePlan {
  requests: unknown[];
  /** What the requests do, in plain words (logged, shown on Sinkronisasi). */
  actions: string[];
  /** Why part of the change was not made. */
  blockers: string[];
}

interface Geometry {
  lastRow: number;
  keyCol: number;
  /** Start column of every existing group. */
  slots: number[];
  summary: Record<SummaryKey, number>;
}

type SummaryKey =
  | "count"
  | "lastDate"
  | "lastBmi"
  | "lastCategory"
  | "delta"
  | "next"
  | "status"
  | "note"
  | "reportBmi"
  | "reportCategory";

const SUMMARY_HEADERS: Record<SummaryKey, string> = {
  count: "Jumlah Cek",
  lastDate: "Tgl Cek Terakhir",
  lastBmi: "BMI Terakhir",
  lastCategory: "Kategori Terakhir",
  delta: "Δ Berat (kg)",
  next: "Cek Berikutnya",
  status: "Status Jadwal",
  note: "Catatan Program Kebugaran",
  reportBmi: "BMI (slot Laporan Mingguan)",
  reportCategory: "Kategori (slot Laporan Mingguan)",
};

function detect(bmi: RealTab): Geometry | { error: string } {
  const top = bmi.values[3] ?? [];
  const sub = (bmi.values[4] ?? []).map(norm);
  const find = (header: string): number[] => top.flatMap((h, i) => (norm(h) === norm(header) ? [i] : []));

  const slots: number[] = [];
  sub.forEach((h, c) => {
    if (h === "tgl cek" && sub[c + 1] === "tinggi (cm)" && sub[c + 2] === "berat (kg)") slots.push(c);
  });
  if (slots.length === 0) return { error: 'kolom "Tgl Cek / Tinggi (cm) / Berat (kg)" tidak ditemukan di baris 5.' };
  for (let i = 1; i < slots.length; i++) {
    if (slots[i] !== slots[0] + SLOT_WIDTH * i) return { error: "kelompok kolom cek tidak berurutan, tiap kelompok harus lima kolom." };
  }

  const keyCols = find("ID SDM");
  if (keyCols.length !== 1) return { error: 'kolom "ID SDM" tidak ditemukan atau ganda di baris 4.' };

  const summary = {} as Record<SummaryKey, number>;
  for (const [key, header] of Object.entries(SUMMARY_HEADERS) as [SummaryKey, string][]) {
    const cols = find(header);
    if (cols.length !== 1) return { error: `kolom "${header}" tidak ditemukan atau ganda di baris 4.` };
    summary[key] = cols[0];
  }
  if (summary.count < slots[0] + SLOT_WIDTH * slots.length) return { error: "kolom ringkasan harus berada di kanan kelompok cek terakhir." };

  return { lastRow: Math.max(FIRST_DATA_ROW, blockEnd(bmi, FIRST_DATA_ROW)), keyCol: keyCols[0], slots, summary };
}

/** Month names in English: the owner writes periods as "15-20 Oct 2026". */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthOf = (cell: string) => `CHOOSE(MONTH(${cell}),${MONTHS.map((m) => `"${m}"`).join(",")})`;

/**
 * The formulas of the summary columns for a block of groups that runs from column `first` to `last`
 * (0-based, inclusive), row 6. Written with commas (the notation of the API); callers translate.
 */
export function summaryFormulas(first: number, last: number, columns: Record<SummaryKey, number>): Record<"count" | "lastDate" | "lastBmi" | "lastCategory" | "delta" | "next" | "reportBmi" | "reportCategory", string> {
  const a = colLetter(first);
  const z = colLetter(last);
  const rng = `$${a}6:$${z}6`;
  const kind = (off: number) => `(MOD(COLUMN(${rng})-COLUMN($${a}6),${SLOT_WIDTH})=${off})`;
  // FILTER keeps the cells of one kind that hold a value, in column order; the last of them is the latest check.
  // (The LOOKUP(2,1/(..)) idiom was tried first and is not reliable in Google Sheets.)
  const picked = (off: number, present: string) => `FILTER(${rng},${kind(off)},${present})`;
  const lastOf = (off: number, present: string) => `IFERROR(INDEX(${picked(off, present)},1,COLUMNS(${picked(off, present)})),"")`;
  const count = colLetter(columns.count);
  const lastDate = colLetter(columns.lastDate);
  return {
    count: `=IF($B6="","",SUMPRODUCT(${kind(OFF.bmi)}*ISNUMBER(${rng})))`,
    lastDate: `=IF($B6="","",${lastOf(OFF.date, `(${rng}<>"")`)})`,
    lastBmi: `=IF($B6="","",${lastOf(OFF.bmi, `ISNUMBER(${rng})`)})`,
    lastCategory: `=IF($B6="","",${lastOf(OFF.category, `(${rng}<>"")`)})`,
    delta: `=IF($B6="","",IF($${count}6<2,"",IFERROR(${lastOf(OFF.weight, `ISNUMBER(${rng})`)}-INDEX(${picked(OFF.weight, `ISNUMBER(${rng})`)},1,1),"")))`,
    next: `=IF($B6="","",IF($${lastDate}6="",Parameter!$C$7,$${lastDate}6+Parameter!$C$8))`,
    reportBmi: `=IF($B6="","",IFERROR(INDEX(${rng},1,('Laporan Mingguan'!$C$6-1)*${SLOT_WIDTH}+${OFF.bmi + 1}),""))`,
    reportCategory: `=IF($B6="","",IFERROR(INDEX(${rng},1,('Laporan Mingguan'!$C$6-1)*${SLOT_WIDTH}+${OFF.category + 1}),""))`,
  };
}

/** Laporan Mingguan C6: the check slot of the chosen week, using the interval of Parameter. */
export function laporanSlotFormula(): string {
  return `=MAX(1,MIN(Parameter!$C$10,INT((Parameter!$C$5+(C4-1)*7-Parameter!$C$7)/Parameter!$C$8)+1))`;
}

/** Laporan Mingguan D6: "BMI Cek ke-3 (Periode 9-22 Nov 2026)" for slot C6. */
export function laporanLabelFormula(): string {
  const s = `(Parameter!$C$7+Parameter!$C$8*(C6-1))`;
  const e = `(Parameter!$C$7+Parameter!$C$8*(C6-1)+Parameter!$C$8-1)`;
  const startMonth = `IF(YEAR(${s})<>YEAR(${e})," "&${monthOf(s)}&" "&YEAR(${s}),IF(MONTH(${s})<>MONTH(${e})," "&${monthOf(s)},""))`;
  return `="BMI Cek ke-"&C6&" (Periode "&TEXT(${s},"d")&${startMonth}&"-"&TEXT(${e},"d")&" "&${monthOf(e)}&" "&YEAR(${e})&")"`;
}

function touchPointFormula(): string {
  return `=IF('Master SDM'!I5="","",'Master SDM'!I5)`;
}

const cell = (sheetId: number, row0: number, col0: number) => ({
  sheetId,
  startRowIndex: row0,
  endRowIndex: row0 + 1,
  startColumnIndex: col0,
  endColumnIndex: col0 + 1,
});

const setText = (sheetId: number, row0: number, col0: number, text: string) => ({
  updateCells: { range: cell(sheetId, row0, col0), rows: [{ values: [{ userEnteredValue: { stringValue: text } }] }], fields: "userEnteredValue" },
});

const setFormula = (sheetId: number, row0: number, col0: number, formula: string) => ({
  updateCells: { range: cell(sheetId, row0, col0), rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }], fields: "userEnteredValue" },
});

/** How many whole groups of data the removed groups would take with them. */
function dataInGroups(bmi: RealTab, g: Geometry, fromSlot: number): string | null {
  for (let i = fromSlot; i < g.slots.length; i++) {
    for (let r = FIRST_DATA_ROW; r <= g.lastRow; r++) {
      for (let off = 0; off <= OFF.weight; off++) {
        const v = bmi.values[r - 1]?.[g.slots[i] + off];
        if (v !== undefined && v !== null && v !== "") return `BMI Cek ke-${i + 1}`;
      }
    }
  }
  return null;
}

export function planBmiStructure(input: BmiStructureInput): BmiStructurePlan {
  const { bmi, settings } = input;
  const plan: BmiStructurePlan = { requests: [], actions: [], blockers: [] };
  const g = detect(bmi);
  if ("error" in g) {
    plan.blockers.push(`Tab "${BMI_SHEET}": ${g.error} Struktur tidak disesuaikan.`);
    return plan;
  }
  const sheetId = bmi.sheetId;
  const have = g.slots.length;
  const want = settings.bmiPeriods;
  const first = g.slots[0];
  const oldEnd = first + SLOT_WIDTH * have; // first column after the last group
  const lastRowIdx = g.lastRow; // exclusive end (0-based) of the data rows

  // ---------------------------------------------------------------- 1. groups: grow or shrink
  if (want > have) {
    const add = want - have;
    plan.actions.push(`Tambah ${add} kelompok kolom cek (BMI Cek ke-${have + 1} sampai ke-${want}).`);
    plan.requests.push({
      insertDimension: { range: { sheetId, dimension: "COLUMNS", startIndex: oldEnd, endIndex: oldEnd + SLOT_WIDTH * add }, inheritFromBefore: true },
    });
    const source = { sheetId, startRowIndex: 3, endRowIndex: lastRowIdx, startColumnIndex: oldEnd - SLOT_WIDTH, endColumnIndex: oldEnd };
    for (let j = 0; j < add; j++) {
      const start = oldEnd + SLOT_WIDTH * j;
      plan.requests.push({
        copyPaste: { source, destination: { ...source, startColumnIndex: start, endColumnIndex: start + SLOT_WIDTH }, pasteType: "PASTE_NORMAL", pasteOrientation: "NORMAL" },
      });
      // The copy carried the last group's data: clear the three input columns of the new group.
      plan.requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: FIRST_DATA_ROW - 1, endRowIndex: lastRowIdx, startColumnIndex: start, endColumnIndex: start + OFF.weight + 1 },
          cell: {},
          fields: "userEnteredValue",
        },
      });
      (input.lastGroupWidths ?? []).forEach((px, off) => {
        plan.requests.push({
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: start + off, endIndex: start + off + 1 },
            properties: { pixelSize: px },
            fields: "pixelSize",
          },
        });
      });
      plan.requests.push({
        mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: start, endColumnIndex: start + SLOT_WIDTH }, mergeType: "MERGE_ALL" },
      });
    }
  } else if (want < have) {
    const blocker = dataInGroups(bmi, g, want);
    if (blocker) {
      plan.blockers.push(`${blocker} masih berisi data di Google Sheet, jadi jumlah cek tidak dikurangi menjadi ${want}. Kosongkan datanya atau naikkan lagi jumlah cek.`);
      return plan;
    }
    plan.actions.push(`Hapus ${have - want} kelompok kolom cek (BMI Cek ke-${want + 1} sampai ke-${have}).`);
    plan.requests.push({
      deleteDimension: { range: { sheetId, dimension: "COLUMNS", startIndex: first + SLOT_WIDTH * want, endIndex: oldEnd } },
    });
  }

  const shift = SLOT_WIDTH * (want - have);
  const at = (col: number) => (col >= oldEnd ? col + shift : col);
  const lastGroupCol = first + SLOT_WIDTH * want - 1;
  const columns = Object.fromEntries(Object.entries(g.summary).map(([k, v]) => [k, at(v)])) as Record<SummaryKey, number>;

  // ---------------------------------------------------------------- 2. headers of the groups
  const labels = bmiCheckLabels(settings);
  let headerChanges = 0;
  labels.forEach((label, i) => {
    const col = first + SLOT_WIDTH * i;
    const existing = i < have ? bmi.values[3]?.[col] : undefined;
    if (existing === label && !(bmi.formulas[3]?.[col] as string | undefined)?.startsWith("=")) return;
    headerChanges++;
    plan.requests.push(setText(sheetId, 3, col, label));
  });
  if (headerChanges > 0 && want === have) plan.actions.push(`Perbarui judul ${headerChanges} kelompok cek (BMI Cek ke-N dan periodenya).`);

  // ---------------------------------------------------------------- 3. summary formulas
  const wanted = summaryFormulas(first, lastGroupCol, columns);
  const stale =
    want !== have ||
    (Object.keys(wanted) as (keyof typeof wanted)[]).some(
      (key) => !isCurrent(key, bmi.formulas[FIRST_DATA_ROW - 1]?.[g.summary[key]], first, lastGroupCol),
    );
  if (stale) {
    plan.actions.push("Tulis ulang rumus ringkasan (Jumlah Cek, Tgl Cek Terakhir, BMI Terakhir, Kategori Terakhir, Delta Berat, Cek Berikutnya, kolom Laporan).");
    for (const [key, formula] of Object.entries(wanted)) plan.requests.push(setFormula(sheetId, FIRST_DATA_ROW - 1, columns[key as SummaryKey], formula));
    if (lastRowIdx > FIRST_DATA_ROW) {
      for (const key of Object.keys(wanted) as (keyof typeof wanted)[]) {
        const col = columns[key];
        plan.requests.push({
          copyPaste: {
            source: { sheetId, startRowIndex: FIRST_DATA_ROW - 1, endRowIndex: FIRST_DATA_ROW, startColumnIndex: col, endColumnIndex: col + 1 },
            destination: { sheetId, startRowIndex: FIRST_DATA_ROW, endRowIndex: lastRowIdx, startColumnIndex: col, endColumnIndex: col + 1 },
            pasteType: "PASTE_FORMULA",
            pasteOrientation: "NORMAL",
          },
        });
      }
    }
  }

  // ---------------------------------------------------------------- 4. Touch Point instead of Program
  if (norm(bmi.values[3]?.[TOUCH_POINT_COL]) !== "touch point") {
    plan.actions.push('Kolom E diganti dari "Program" menjadi "Touch Point" (mengikuti Master SDM).');
    plan.requests.push(setText(sheetId, 3, TOUCH_POINT_COL, "Touch Point"));
    plan.requests.push(setFormula(sheetId, FIRST_DATA_ROW - 1, TOUCH_POINT_COL, touchPointFormula()));
    if (lastRowIdx > FIRST_DATA_ROW) {
      plan.requests.push({
        copyPaste: {
          source: cell(sheetId, FIRST_DATA_ROW - 1, TOUCH_POINT_COL),
          destination: { sheetId, startRowIndex: FIRST_DATA_ROW, endRowIndex: lastRowIdx, startColumnIndex: TOUCH_POINT_COL, endColumnIndex: TOUCH_POINT_COL + 1 },
          pasteType: "PASTE_FORMULA",
          pasteOrientation: "NORMAL",
        },
      });
    }
  }

  // ---------------------------------------------------------------- 5. texts about the rhythm
  const intro = String(bmi.values[1]?.[0] ?? "");
  if (/per bulan/i.test(intro)) {
    plan.actions.push("Perbarui kalimat petunjuk di baris 2 tab Cek BMI.");
    plan.requests.push(
      setText(
        sheetId,
        1,
        0,
        `Isi 'Ada Catatan BMI', Tgl Cek, Tinggi (cm) dan Berat (kg) di sel kuning. Semua petugas dicek tiap ${settings.bmiIntervalDays} hari. BMI & kategori otomatis (IMT Kemenkes RI).`,
      ),
    );
  }

  const param = input.parameter;
  if (param) {
    const labelRow = (text: string) => (param.values.findIndex((r) => norm(r?.[1]) === norm(text)));
    const rename = (from: string, to: string, note: string) => {
      const i = labelRow(from);
      if (i < 0) return;
      plan.actions.push(note);
      plan.requests.push(setText(param.sheetId, i, 1, to));
    };
    rename("Interval cek BMI – ada catatan (hari)", "Interval antar cek BMI (hari, semua petugas)", "Ganti nama baris interval di Parameter: berlaku untuk semua petugas.");
    rename("Interval cek BMI – tanpa catatan (bulan)", "Interval cek BMI – tanpa catatan (bulan), tidak dipakai lagi", "Tandai baris interval bulanan di Parameter sebagai tidak dipakai.");
  }

  const rep = input.laporan;
  if (rep) {
    const i = rep.values.findIndex((r) => norm(r?.[1]) === "slot cek bmi terkait");
    if (i >= 0) {
      const c6 = String(rep.formulas[i]?.[2] ?? "");
      const d6 = String(rep.formulas[i]?.[3] ?? "");
      if (/\/14\)/.test(c6) || !/Parameter!\$C\$8/.test(c6) || !/BMI Cek ke-/.test(d6)) {
        plan.actions.push("Laporan Mingguan: slot cek BMI terkait memakai interval dari Parameter dan nama BMI Cek ke-N.");
        plan.requests.push(setFormula(rep.sheetId, i, 2, laporanSlotFormula()));
        plan.requests.push(setFormula(rep.sheetId, i, 3, laporanLabelFormula()));
      }
    }
  }

  const guide = input.petunjuk;
  if (guide) {
    guide.values.forEach((row, r) =>
      row.forEach((v, c) => {
        if (typeof v === "string" && /tiap bulan untuk lainnya/i.test(v) && /Cek Berikutnya/.test(v)) {
          plan.actions.push("Perbarui kalimat jadwal cek BMI di Petunjuk.");
          plan.requests.push(
            setText(guide.sheetId, r, c, `Cek BMI sesuai jadwal (kolom 'Cek Berikutnya' di Cek BMI 2 Mingguan): tiap ${settings.bmiIntervalDays} hari untuk semua petugas.`),
          );
        }
      }),
    );
  }

  return plan;
}

/**
 * Is this summary formula the one this module writes for the block of groups first..last? Checked by
 * what matters (the block it covers, the mask, the interval) rather than by exact text, because Sheets
 * may re-format a formula it stores.
 */
export function isCurrent(key: keyof ReturnType<typeof summaryFormulas>, formula: unknown, first: number, last: number): boolean {
  const f = String(formula ?? "").replace(/\s+/g, "");
  const block = `$${colLetter(first)}6:$${colLetter(last)}6`;
  switch (key) {
    case "next":
      return f.includes("Parameter!$C$8") && !/EDATE/i.test(f);
    case "reportBmi":
    case "reportCategory":
      return f.includes(block) && /INDEX/i.test(f);
    default:
      return f.includes(block) && /MOD\(COLUMN/i.test(f) && (key === "count" || /FILTER\(/i.test(f));
  }
}

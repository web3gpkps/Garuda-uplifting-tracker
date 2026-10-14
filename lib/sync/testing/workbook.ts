/**
 * An in-memory copy of the Garuda workbook layout (values + formulas + notes), built from DB rows, and
 * a world that syncs it exactly like the route: project -> merge -> translate -> apply.
 * Mirrors the real sheet's structure (header rows, fixed blocks of pre-made rows with their formulas,
 * free Master SDM rows, Cek BMI mirroring Master SDM by position, spare Log rows, numbered Tindak Lanjut /
 * Remedial / Penggantian rows, Parameter labels) with synthetic data only.
 */
import { a1Column } from "../sheets";
import { countOps, projectAll, translate, type RealOps, type RealSnapshot, type RealTab } from "../layouts";
import { finalizeBaseline, merge } from "../merge";
import { isoToSerial } from "../normalize";
import { SETTINGS_ENTRIES, SYNC_TABLES } from "../tables";
import { FakeDb } from "./fakes";
import type { Baseline, ConflictPolicy, DbSnapshot, Plan, SyncTable, TableSpec } from "../types";

interface Cell {
  v: unknown;
  f?: string;
}

interface BookTab {
  sheetId: number;
  grid: (Cell | undefined)[][];
  notes: Map<string, string>;
  hiddenCols: Set<number>;
  rowCount: number;
}

/** "AK" -> 36 */
export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseA1(a1: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(a1)!;
  return { col: colIndex(m[1]), row: Number(m[2]) };
}

export class FakeWorkbook {
  tabs = new Map<string, BookTab>();
  locale = "en_US";
  timeZone = "America/Los_Angeles";
  /** Every tab a write landed in (values, notes, headers, formulas, deletes, appends). */
  written = new Set<string>();
  private nextId = 1;

  /** A copy of a real snapshot (values + formulas), e.g. to replay a sync of the real sheet in memory. */
  static fromSnapshot(real: RealSnapshot): FakeWorkbook {
    const b = new FakeWorkbook();
    b.locale = real.locale ?? b.locale;
    b.timeZone = real.timeZone ?? b.timeZone;
    for (const [title, t] of Object.entries(real.tabs)) {
      if (!t) continue;
      b.addTab(title, t.rowCount);
      const rows = Math.max(t.values.length, t.formulas.length);
      for (let r = 1; r <= rows; r++) {
        const width = Math.max(t.values[r - 1]?.length ?? 0, t.formulas[r - 1]?.length ?? 0);
        for (let c = 0; c < width; c++) {
          const v = t.values[r - 1]?.[c];
          const f = t.formulas[r - 1]?.[c];
          const isF = typeof f === "string" && f.startsWith("=") && f !== v;
          if (isF || (v !== "" && v !== undefined && v !== null)) b.setAt(title, r, c, v, isF ? (f as string) : undefined);
        }
      }
    }
    return b;
  }

  addTab(title: string, rowCount = 1000) {
    this.tabs.set(title, { sheetId: this.nextId++, grid: [], notes: new Map(), hiddenCols: new Set(), rowCount });
    return this;
  }

  private tab(title: string) {
    const t = this.tabs.get(title);
    if (!t) throw new Error(`no tab ${title}`);
    return t;
  }

  set(title: string, a1: string, v: unknown, f?: string) {
    const { row, col } = parseA1(a1);
    this.setAt(title, row, col, v, f);
  }

  setAt(title: string, row: number, col: number, v: unknown, f?: string) {
    const t = this.tab(title);
    while (t.grid.length < row) t.grid.push([]);
    t.grid[row - 1][col] = v === undefined && !f ? undefined : { v, f };
  }

  /** Current value (mirror formulas recalculated, as Sheets shows them). */
  get(title: string, a1: string): unknown {
    this.recalc();
    const { row, col } = parseA1(a1);
    return this.tab(title).grid[row - 1]?.[col]?.v ?? "";
  }

  formula(title: string, a1: string): string | undefined {
    const { row, col } = parseA1(a1);
    return this.tab(title).grid[row - 1]?.[col]?.f;
  }

  note(title: string, a1: string): string | undefined {
    const { row, col } = parseA1(a1);
    return this.tab(title).notes.get(`${row}:${col}`);
  }

  hidden(title: string, letters: string): boolean {
    return this.tab(title).hiddenCols.has(colIndex(letters));
  }

  /** First data row (from `from`) whose column `letters` equals `value`. */
  findRow(title: string, letters: string, value: unknown, from = 1): number {
    this.recalc();
    const t = this.tab(title);
    const c = colIndex(letters);
    for (let r = from; r <= t.grid.length; r++) if (t.grid[r - 1]?.[c]?.v === value) return r;
    throw new Error(`${title}: no ${letters}=${String(value)}`);
  }

  /**
   * What Sheets returns, after recalculation. Only the workbook's mirror formulas
   * (`=IF('Master SDM'!B5="","",'Master SDM'!B5)`) are recalculated; other formula cells keep their value.
   */
  snapshot(): RealSnapshot {
    this.recalc();
    const tabs: RealSnapshot["tabs"] = {};
    for (const [title, t] of this.tabs) {
      const last = lastUsed(t.grid);
      const values = t.grid.slice(0, last).map((r) => trimRow((r ?? []).map((c) => (c ? (c.v ?? "") : ""))));
      const formulas = t.grid.slice(0, last).map((r) => trimRow((r ?? []).map((c) => (c ? (c.f ?? c.v ?? "") : ""))));
      const columnCount = Math.max(26, ...t.grid.map((r) => r?.length ?? 0));
      const tab: RealTab = { title, sheetId: t.sheetId, values, formulas, rowCount: t.rowCount, columnCount };
      tabs[title] = tab;
    }
    return { tabs, locale: this.locale, timeZone: this.timeZone };
  }

  private recalc() {
    const mirror = /^=IF\('([^']+)'!\$?([A-Z]+)\$?(\d+)="","",'\1'!\$?\2\$?\3\)$/;
    for (const t of this.tabs.values()) {
      for (const row of t.grid) {
        for (const cell of row ?? []) {
          const m = cell?.f ? mirror.exec(cell.f) : null;
          if (!m || !this.tabs.has(m[1])) continue;
          const src = this.tabs.get(m[1])!.grid[Number(m[3]) - 1]?.[colIndex(m[2])]?.v;
          cell!.v = src === undefined || src === null ? "" : src;
        }
      }
    }
  }

  /** Same order and semantics as GoogleSheets.apply. Refuses to overwrite a formula cell. */
  apply(ops: RealOps, ids: Map<number, number | string>, skip: Set<string> = new Set()) {
    const keep = <T extends { table: string }>(xs: T[]) => xs.filter((x) => !skip.has(x.table));
    this.locale = "in_ID";
    this.timeZone = "Asia/Jakarta";
    for (const c of keep(ops.createTabs)) {
      if (!c.exists) this.addTab(c.tab);
      const t = this.tab(c.tab);
      t.grid = [c.header.map((h) => ({ v: h }))];
      this.written.add(c.tab);
    }
    for (const h of keep(ops.headerCells)) {
      this.guard(h.tab, h.row, h.col);
      this.setAt(h.tab, h.row, h.col, h.text);
      if (h.hide) this.tab(h.tab).hiddenCols.add(h.col);
      this.written.add(h.tab);
    }
    for (const w of keep(ops.writes)) {
      let value = w.value;
      if (w.ref !== undefined) {
        const id = ids.get(w.ref);
        if (id === undefined) continue;
        value = Number(id);
      }
      this.guard(w.tab, w.row, w.col);
      if (w.row > this.tab(w.tab).rowCount) throw new Error(`${w.tab}: row ${w.row} beyond grid`);
      this.setAt(w.tab, w.row, w.col, value === "" ? undefined : value);
      this.written.add(w.tab);
    }
    for (const n of keep(ops.notes)) {
      const t = this.tab(n.tab);
      if (n.text) t.notes.set(`${n.row}:${n.col}`, n.text);
      else t.notes.delete(`${n.row}:${n.col}`);
      this.written.add(n.tab);
    }
    for (const d of keep(ops.deleteRows)) {
      const t = this.tab(d.tab);
      for (const r of [...d.rows].sort((a, b) => b - a)) t.grid.splice(r - 1, 1);
      this.written.add(d.tab);
    }
    for (const a of keep(ops.appends)) {
      const t = this.tab(a.tab);
      t.grid.length = lastUsed(t.grid);
      for (const row of a.rows) t.grid.push(row.map((v) => (v === "" ? undefined : { v })));
      this.written.add(a.tab);
    }
  }

  private guard(tab: string, row: number, col: number) {
    const f = this.tabs.get(tab)?.grid[row - 1]?.[col]?.f;
    if (f) throw new Error(`write to formula cell ${tab}!${a1Column(col)}${row}`);
  }
}

function lastUsed(grid: (Cell | undefined)[][]): number {
  for (let i = grid.length - 1; i >= 0; i--) {
    if ((grid[i] ?? []).some((c) => c && (c.f || (c.v !== undefined && c.v !== "")))) return i + 1;
  }
  return 0;
}

function trimRow(row: unknown[]): unknown[] {
  const out = [...row];
  while (out.length && (out[out.length - 1] === "" || out[out.length - 1] === undefined)) out.pop();
  return out.map((v) => (v === undefined ? "" : v));
}

// ------------------------------------------------------------------ builder

export interface WorkbookOptions {
  /** Free rows (no ID, no name, formulas only) after the staff rows in Master SDM (and Cek BMI). */
  masterFree?: number;
  /** Weeks pre-made in Log Performa Mingguan (one row per staff and week). */
  weeks?: number;
  /** Free formula rows below the pre-made Log rows. */
  logSpare?: number;
  /** Free numbered rows below the action items in Tindak Lanjut. */
  tlFree?: number;
  /** Free numbered rows below the remedial rows. */
  remedialFree?: number;
  /** Pre-numbered rows in Penggantian SDM. */
  replacementSlots?: number;
  /** Penggantian SDM already has the engine's ID Sistem / ID SDM columns (P, Q), filled. */
  withIdColumns?: boolean;
  /** Action items whose Batas Waktu (J) is a formula (EDATE on Parameter), as GA-TL01 in the workbook. */
  dueFormula?: string[];
}

const serial = (iso: unknown) => (typeof iso === "string" && iso ? isoToSerial(iso) : undefined);
type Row = Record<string, unknown>;
const bySort = (rows: Row[] | undefined) =>
  [...(rows ?? [])].sort((x, y) => Number(x.sort_order ?? x.id ?? 0) - Number(y.sort_order ?? y.id ?? 0));
/** `=IF('Tab'!B5="","",'Tab'!B5)`: the workbook's way of mirroring another tab's cell. */
const mirror = (tab: string, a1: string) => `=IF('${tab}'!${a1}="","",'${tab}'!${a1})`;

/**
 * The Garuda workbook as imported: same data as the DB, native layout (header rows, fixed blocks of
 * pre-made rows with their formulas, Cek BMI wide with 6 slots, Parameter labels).
 */
export function buildWorkbook(db: DbSnapshot, opts: WorkbookOptions = {}): FakeWorkbook {
  const { masterFree = 3, weeks = 2, logSpare = 4, tlFree = 3, remedialFree = 3, replacementSlots = 6, dueFormula = [] } = opts;
  const b = new FakeWorkbook();
  const staff = bySort(db.staff as Row[]);
  const settings = ((db.settings ?? [])[0] ?? {}) as Row;
  const put = (tab: string, a1: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== "") b.set(tab, a1, v);
  };
  const headers = (tab: string, row: number, names: string[], from = 0) => names.forEach((h, c) => b.setAt(tab, row, from + c, h));

  b.addTab("Petunjuk");
  b.set("Petunjuk", "A1", "PETUNJUK PENGGUNAAN");
  b.addTab("Dashboard");
  b.set("Dashboard", "A1", "DASHBOARD");
  b.set("Dashboard", "C3", "", "=Parameter!$C$30");
  b.set("Dashboard", "E8", 0, "=COUNTIFS('Tindak Lanjut'!L5:L54,\"Selesai\")");
  b.addTab("Laporan Mingguan");
  b.set("Laporan Mingguan", "C4", 2);
  b.set("Laporan Mingguan", "C6", 1, "=MAX(1,MIN(Parameter!$C$10,1))");

  // ---- Tindak Lanjut (header row 4, rows 5.., No + Q/R formulas in every block row)
  const TL = "Tindak Lanjut";
  b.addTab(TL);
  b.set(TL, "A1", "TRACKING TINDAK LANJUT REKOMENDASI PEOPLE DEVELOPMENT GARUDA");
  headers(TL, 4, ["No", "ID", "Kelompok", "Aspek", "Akar Masalah / Temuan", "Tindakan / Inisiatif", "Target / KPI", "Jenis", "Jadwal",
    "Batas Waktu", "PIC", "Status", "% Progres", "Tgl Update", "Realisasi / Bukti", "Catatan Garuda / KPS", "Sisa Hari", "Flag", "Sumber"]);
  const items = bySort(db.action_items as Row[]);
  for (let i = 0; i < items.length + tlFree; i++) {
    const r = 5 + i;
    b.set(TL, `A${r}`, i + 1);
    b.set(TL, `Q${r}`, "", `=IF(OR(J${r}="",L${r}="Selesai"),"",J${r}-Parameter!$C$30)`);
    b.set(TL, `R${r}`, "", `=IF(B${r}="","",IF(L${r}="Selesai","Selesai","On Track"))`);
    const it = items[i];
    if (!it) continue;
    const cols: [string, unknown][] = [["B", it.code], ["C", it.group_name], ["D", it.aspect], ["E", it.root_cause], ["F", it.action],
      ["G", it.target], ["H", it.kind], ["I", it.schedule], ["K", it.pic], ["L", it.status],
      ["M", typeof it.progress === "number" ? it.progress / 100 : it.progress], ["N", serial(it.updated_on)], ["O", it.evidence],
      ["P", it.kps_notes], ["S", it.source]];
    for (const [c, v] of cols) put(TL, `${c}${r}`, v);
    if (dueFormula.includes(String(it.code))) b.set(TL, `J${r}`, serial(it.due_date) ?? "", "=EDATE(Parameter!$C$5,Parameter!$C$21)");
    else put(TL, `J${r}`, serial(it.due_date));
  }

  // ---- Master SDM (header row 4, data 5.., free rows: No + formulas only)
  const MS = "Master SDM";
  b.addTab(MS);
  b.set(MS, "A1", "MASTER SDM GARUDA");
  headers(MS, 4, ["No", "ID SDM", "Program", "Provider", "Unit", "Nama Petugas", "Employee Number", "L/P", "Touch Point", "Role Play",
    "Post-Test", "Final Result", "Remark di Laporan", "Status Menurut Kriteria ≥85", "Cek Konsistensi", "Penyebab Utama",
    "Status Penugasan", "Evaluation Feedback", "Catatan"]);
  const masterRows = staff.length + masterFree;
  for (let i = 0; i < masterRows; i++) {
    const r = 5 + i;
    b.set(MS, `A${r}`, i + 1);
    b.set(MS, `L${r}`, "", `=IF(COUNT(J${r}:K${r})<2,"",ROUND(J${r}*Parameter!$C$17+K${r}*Parameter!$C$18,1))`);
    b.set(MS, `N${r}`, "", `=IF(L${r}="","",IF(L${r}>=Parameter!$C$16,"Passed","Failed"))`);
    b.set(MS, `O${r}`, "", `=IF(OR(M${r}="",N${r}=""),"",IF(M${r}=N${r},"Sama","Beda – verifikasi"))`);
    b.set(MS, `P${r}`, "", `=IF(N${r}<>"Failed","","Performa role play belum optimal")`);
    const s = staff[i];
    if (!s) continue;
    const cols: [string, unknown][] = [["B", s.code], ["C", s.program], ["D", s.provider], ["E", s.station], ["F", s.name], ["G", s.employee_no],
      ["H", s.gender], ["I", s.touch_point], ["J", s.role_play], ["K", s.post_test], ["M", s.report_remark], ["Q", s.assignment_status],
      ["R", s.feedback], ["S", s.notes]];
    for (const [c, v] of cols) put(MS, `${c}${r}`, v);
  }

  // ---- Cek BMI 2 Mingguan (header rows 4-5, data 6.., row = Master row + 1, 6 slots from J)
  const BMI = "Cek BMI 2 Mingguan";
  b.addTab(BMI);
  b.set(BMI, "A1", "CEK BMI, TINGGI BADAN & BERAT BADAN");
  headers(BMI, 4, ["No", "ID SDM", "Nama Petugas", "Unit", "Program", "L/P", "Coaching Evaluation Feedback", "Result/Remarks", "Ada Catatan BMI"]);
  for (let k = 0; k < 6; k++) {
    const start = 9 + k * 5;
    b.setAt(BMI, 4, start, `Cek ke-${k + 1}`, `="Cek ke-${k + 1} (rencana "&TEXT(Parameter!$C$7+14*${k},"dd/mm/yyyy")&")"`);
    headers(BMI, 5, ["Tgl Cek", "Tinggi (cm)", "Berat (kg)", "BMI", "Kategori"], start);
  }
  headers(BMI, 4, ["Jumlah Cek", "Tgl Cek Terakhir", "BMI Terakhir", "Kategori Terakhir", "Δ Berat (kg)", "Cek Berikutnya", "Status Jadwal",
    "Catatan Program Kebugaran", "BMI (slot Laporan Mingguan)", "Kategori (slot Laporan Mingguan)"], 39);
  const checks = (db.bmi_checks ?? []) as Row[];
  for (let i = 0; i < masterRows; i++) {
    const mr = 5 + i;
    const r = mr + 1;
    const s = staff[i];
    b.set(BMI, `A${r}`, i + 1);
    b.set(BMI, `B${r}`, s?.code ?? "", mirror(MS, `B${mr}`));
    b.set(BMI, `C${r}`, s?.name ?? "", mirror(MS, `F${mr}`));
    b.set(BMI, `D${r}`, s?.station ?? "", mirror(MS, `E${mr}`));
    b.set(BMI, `E${r}`, s?.program ?? "", mirror(MS, `C${mr}`));
    b.set(BMI, `F${r}`, s?.gender ?? "", mirror(MS, `H${mr}`));
    b.set(BMI, `G${r}`, s?.feedback ?? "", mirror(MS, `R${mr}`));
    b.set(BMI, `H${r}`, s?.notes ?? "", mirror(MS, `S${mr}`));
    if (s?.bmi_has_note === true) b.set(BMI, `I${r}`, "Ya");
    if (s?.bmi_has_note === false) b.set(BMI, `I${r}`, "Tidak");
    for (let k = 0; k < 6; k++) {
      const start = 9 + k * 5;
      const c = s && checks.find((x) => x.staff_code === s.code && x.period === k + 1);
      if (c) {
        if (c.check_date) b.setAt(BMI, r, start, serial(c.check_date));
        b.setAt(BMI, r, start + 1, c.height_cm);
        b.setAt(BMI, r, start + 2, c.weight_kg);
      }
      const [h, w] = [`${a1Column(start + 1)}${r}`, `${a1Column(start + 2)}${r}`];
      b.setAt(BMI, r, start + 3, "", `=IF(OR(${h}="",${w}=""),"",ROUND(${w}/(${h}/100)^2,1))`);
      b.setAt(BMI, r, start + 4, "", `=IF(${a1Column(start + 3)}${r}="","",IF(${a1Column(start + 3)}${r}<Parameter!$C$12,"Kurus","Normal"))`);
    }
    for (const col of ["AN", "AO", "AP", "AQ", "AR", "AS", "AT", "AV", "AW"]) b.set(BMI, `${col}${r}`, "", `=IF(B${r}="","",0)`);
    put(BMI, `AU${r}`, s?.bmi_note);
  }

  // ---- Log Performa Mingguan (header row 4, pre-made rows per week and staff, spare formula rows)
  const LOG = "Log Performa Mingguan";
  b.addTab(LOG);
  b.set(LOG, "A1", "LOG PENILAIAN COACHING FRONTLINER MINGGUAN");
  headers(LOG, 4, ["Minggu Ke", "Mulai (Senin)", "ID SDM", "Nama Petugas", "Unit", "Program", "Touch Point", "A\nGrooming & Appearance",
    "B\nProduct Knowledge", "C\nAttitude & Behaviour", "D\nCommunication Skill", "Rata-rata", "Status Minggu Ini", "Δ vs Final Result",
    "Topik Gap Utama", "Observer / Coach", "Catatan Coaching"]);
  const weekly = (db.weekly_scores ?? []) as Row[];
  const logFormulas = (r: number) => {
    b.set(LOG, `B${r}`, "", `=IF(A${r}="","",Parameter!$C$5+(A${r}-1)*7)`);
    for (const [col, src] of [["D", "F"], ["E", "E"], ["F", "C"]]) {
      b.set(LOG, `${col}${r}`, "", `=IF(C${r}="","",IFERROR(INDEX('Master SDM'!$${src}$5:$${src}$304,MATCH(C${r},'Master SDM'!$B$5:$B$304,0)),""))`);
    }
    b.set(LOG, `L${r}`, "", `=IF(COUNT(H${r}:K${r})=0,"",ROUND(AVERAGE(H${r}:K${r}),2))`);
    b.set(LOG, `M${r}`, "", `=IF(L${r}="","",IF(L${r}>=Parameter!$C$16,"Lulus","Belum Lulus"))`);
    b.set(LOG, `N${r}`, "", `=IF(OR(L${r}="",C${r}=""),"",L${r})`);
  };
  let r = 5;
  for (let wk = 1; wk <= weeks; wk++) {
    for (const s of staff) {
      b.set(LOG, `A${r}`, wk);
      b.set(LOG, `C${r}`, s.code);
      logFormulas(r);
      const x = weekly.find((y) => y.staff_code === s.code && y.week === wk);
      if (x) {
        const cols: [string, unknown][] = [["G", x.touch_point], ["H", x.score_grooming], ["I", x.score_knowledge], ["J", x.score_attitude],
          ["K", x.score_communication], ["O", x.gap_topic], ["P", x.observer], ["Q", x.coaching_notes]];
        for (const [c, v] of cols) put(LOG, `${c}${r}`, v);
      }
      r++;
    }
  }
  for (let i = 0; i < logSpare; i++) logFormulas(r++);

  b.addTab("Rekap Performa");
  b.set("Rekap Performa", "A1", "REKAP KENAIKAN PERFORMA SDM PER MINGGU");
  for (let i = 0; i < masterRows; i++) b.set("Rekap Performa", `B${6 + i}`, staff[i]?.code ?? "", mirror(MS, `B${5 + i}`));

  // ---- Remedial (header row 4, rows 5.., No + formulas in every block row)
  const REM = "Remedial";
  b.addTab(REM);
  b.set(REM, "A1", "REMEDIAL & EVALUASI ULANG PESERTA IULS / RUST");
  headers(REM, 4, ["No", "ID SDM", "Nama Petugas", "Program", "Unit", "Final Result Awal", "Penyebab Utama", "Tindakan Remedial", "Tgl Remedial",
    "Role Play Ulang", "Post-Test Ulang", "Final Ulang", "Status Ulang", "Kenaikan", "Dilaporkan ke Garuda", "Catatan"]);
  const rems = bySort(db.remedials as Row[]);
  for (let i = 0; i < rems.length + remedialFree; i++) {
    const rr = 5 + i;
    b.set(REM, `A${rr}`, i + 1);
    for (const [col, src] of [["C", "F"], ["D", "C"], ["E", "E"], ["F", "L"], ["G", "P"]]) {
      b.set(REM, `${col}${rr}`, "", `=IF(B${rr}="","",IFERROR(INDEX('Master SDM'!$${src}$5:$${src}$304,MATCH(B${rr},'Master SDM'!$B$5:$B$304,0)),""))`);
    }
    b.set(REM, `L${rr}`, "", `=IF(COUNT(J${rr}:K${rr})<2,"",ROUND(J${rr}*Parameter!$C$17+K${rr}*Parameter!$C$18,1))`);
    b.set(REM, `M${rr}`, "", `=IF(B${rr}="","",IF(L${rr}="",IF(H${rr}="","Belum dijadwalkan","Menunggu hasil"),"Lulus"))`);
    b.set(REM, `N${rr}`, "", `=IF(OR(L${rr}="",F${rr}=""),"",L${rr}-F${rr})`);
    const x = rems[i];
    if (!x) continue;
    const cols: [string, unknown][] = [["B", x.staff_code], ["H", x.action], ["I", serial(x.remedial_on)], ["J", x.role_play], ["K", x.post_test],
      ["O", x.reported], ["P", x.notes]];
    for (const [c, v] of cols) put(REM, `${c}${rr}`, v);
  }

  // ---- Penggantian SDM (header row 4, pre-numbered rows 5..)
  const PG = "Penggantian SDM";
  b.addTab(PG);
  b.set(PG, "A1", "TRACKING PENGGANTIAN SDM");
  headers(PG, 4, ["No", "Program", "Unit", "Nama SDM Diganti", "Alasan / Dasar", "Tgl Ditarik", "Nama SDM Pengganti", "Tgl Efektif", "Tgl Training",
    "Post-Test", "Final Result", "Status Kelulusan", "Ketepatan Waktu", "Dilaporkan ke Garuda", "Catatan"]);
  if (opts.withIdColumns) {
    b.set(PG, "P4", "ID Sistem");
    b.set(PG, "Q4", "ID SDM");
  }
  const reps = bySort(db.replacements as Row[]);
  for (let i = 0; i < replacementSlots; i++) {
    const rr = 5 + i;
    b.set(PG, `A${rr}`, i + 1);
    b.set(PG, `L${rr}`, "", `=IF(G${rr}="","",IF(OR(J${rr}="",K${rr}=""),"Belum training/dinilai","?"))`);
    b.set(PG, `M${rr}`, "", `=IF(D${rr}="","",IF(H${rr}="","Menunggu","?"))`);
    const x = reps[i];
    if (!x) continue;
    const cols: [string, unknown][] = [["B", x.program], ["C", x.station], ["D", x.replaced_name], ["E", x.reason], ["F", serial(x.withdrawn_on)],
      ["G", x.replacement_name], ["H", serial(x.effective_on)], ["I", serial(x.training_on)], ["J", x.post_test], ["K", x.final_result],
      ["N", x.reported], ["O", x.notes]];
    if (opts.withIdColumns) cols.push(["P", x.id], ["Q", x.staff_code]);
    for (const [c, v] of cols) put(PG, `${c}${rr}`, v);
  }

  for (const t of ["Data Coaching", "Data Training"]) {
    b.addTab(t);
    b.set(t, "A1", `DATA ACUAN – ${t.toUpperCase()}`);
    b.set(t, "C6", 795);
  }

  // ---- Parameter: label B, value C (section titles without a value, TODAY() in C30)
  const PAR = "Parameter";
  b.addTab(PAR);
  b.set(PAR, "A1", "PARAMETER & DAFTAR PILIHAN");
  headers(PAR, 4, ["Parameter", "Nilai", "Keterangan / sumber"], 1);
  b.set(PAR, "G4", "Unit / Station");
  (db.stations ?? []).forEach((st, i) => b.set(PAR, `G${5 + i}`, st.code));
  const paramRows: (string | null)[] = [
    "week1_start", "weeks", "bmi_first_check", "bmi_interval_days", "bmi_interval_months", "bmi_periods", "#Klasifikasi BMI",
    "bmi_underweight_below", "bmi_normal_max", "bmi_overweight_max", "#Kriteria kelulusan", "pass_grade", "weight_role_play",
    "weight_post_test", "#Target KPI", "target_overweight_max", "target_overweight_months", "target_knowledge",
    "target_interactive", "target_coverage", "coverage_done", "target_pass_rate", "#Penggantian SDM", "replacement_deadline", null,
  ];
  paramRows.forEach((key, i) => {
    const rr = 5 + i;
    if (key === null) return;
    if (key.startsWith("#")) return b.set(PAR, `B${rr}`, key.slice(1));
    if (key === "bmi_interval_months") {
      // No longer a synced setting: the real workbook still has the row, untouched by the engine.
      b.set(PAR, `B${rr}`, "Interval cek BMI – tanpa catatan (bulan)");
      return b.set(PAR, `C${rr}`, 1);
    }
    const e = SETTINGS_ENTRIES.find((x) => x.key === key)!;
    b.set(PAR, `B${rr}`, e.label);
    put(PAR, `C${rr}`, e.type.kind === "date" ? serial(settings[key]) : settings[key]);
  });
  b.set(PAR, "B30", "Tanggal acuan (hari ini)");
  b.set(PAR, "C30", isoToSerial("2026-10-12"), "=TODAY()");
  return b;
}

// ------------------------------------------------------------------ world

export class WorkbookWorld {
  book: FakeWorkbook;
  db: FakeDb;
  baseline: Baseline | null = null;
  specs: TableSpec[] = SYNC_TABLES;

  constructor(db: DbSnapshot, opts: WorkbookOptions & { book?: FakeWorkbook } = {}) {
    this.db = new FakeDb(db);
    this.book = opts.book ?? buildWorkbook(db, opts);
  }

  prepare(opts: { conflictPolicy?: ConflictPolicy; allowMassDelete?: SyncTable[] } = {}) {
    const real = this.book.snapshot();
    const { sheet, projections } = projectAll(real, this.specs);
    const plan: Plan = merge({ baseline: this.baseline, sheet, db: this.db.snapshot(), specs: this.specs, ...opts });
    const ops = translate(plan, projections, real);
    return { plan, ops, counts: countOps(ops) };
  }

  sync(opts: { conflictPolicy?: ConflictPolicy; allowMassDelete?: SyncTable[] } = {}) {
    const prepared = this.prepare(opts);
    const ids = this.db.apply(prepared.plan, this.specs);
    this.book.apply(prepared.ops, ids);
    this.baseline = finalizeBaseline(prepared.plan, ids, this.specs);
    return prepared;
  }
}

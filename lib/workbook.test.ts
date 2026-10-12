import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dashboard, weeklyReport, type ActionProgressRow, type TrackerData } from './aggregate';

/**
 * Parity with the workbook's own cached results. Needs scripts/out/rows.json, written by
 * `python3 -I scripts/import_xlsx.py` from the (gitignored) workbook; skipped without it.
 * Rows are positional copies of the workbook sections (column C onwards), Excel "" = null.
 */
const ROWS = fileURLToPath(new URL('../scripts/out/rows.json', import.meta.url));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const file: any = existsSync(ROWS) ? JSON.parse(readFileSync(ROWS, 'utf8')) : null;

const blankToNull = (v: unknown) => (v === '' || v === undefined ? null : v);

function close(actual: number | null, expected: unknown, where: string, digits = 6) {
  const e = blankToNull(expected);
  if (e === null) {
    expect({ where, actual }).toEqual({ where, actual: null });
    return;
  }
  expect(typeof actual).toBe('number');
  if (Math.abs((actual as number) - (e as number)) > 10 ** -digits) {
    throw new Error(`${where}: expected ${e}, got ${actual}`);
  }
}

function checkActions(rows: ActionProgressRow[], expected: Record<string, unknown[]>, where: string) {
  for (const r of rows) {
    const e = expected[r.key];
    const vals = [r.total, r.selesai, r.onProgress, r.belumMulai, r.tertunda, r.overdue, r.dueSoon, r.pctDone,
      r.avgProgress === null ? null : r.avgProgress / 100];
    vals.forEach((v, i) => close(v, e[i], `${where} ${r.key}[${i}]`));
  }
}

describe.skipIf(!file)('parity with the workbook (needs scripts/out/rows.json)', () => {
  const f = file;
  const data: TrackerData = {
    settings: f.settings,
    stations: f.stations,
    staff: f.staff,
    weeklyScores: f.weeklyScores,
    bmiChecks: f.bmiChecks,
    actionItems: f.actionItems,
    remedials: f.remedials,
    replacements: f.replacements,
  };
  const today = f.expected.today;
  const d = dashboard(data, today);
  const x = f.expected.dashboard;

  test('Dashboard 1: KPI', () => {
    const labels = Object.keys(x.kpis);
    d.kpis.forEach((k, i) => {
      const [, , actual] = x.kpis[labels[i]];
      close(k.actual, actual, `kpi ${k.key}`);
    });
  });

  test('Dashboard 2–3: action items per group and aspect', () => {
    checkActions(d.actionByGroup, x.byGroup, 'group');
    checkActions(d.actionByAspect, x.byAspect, 'aspect');
  });

  test('Dashboard 4: results per program', () => {
    for (const p of d.programs) {
      const e = x.programs[p.key];
      [p.participants, p.passed, p.failed, p.absentRolePlay, p.remedialRecorded, p.remedialPassed, p.finalPassed,
        p.pctFinalPassed, p.pdfBaseline, p.beda].forEach((v, i) => close(v, e[i], `program ${p.key}[${i}]`));
    }
  });

  test('Dashboard 5: per station', () => {
    for (const u of d.units) {
      const e = x.units[u.key];
      if (!e) continue;
      [u.staffCount, u.passed, u.failed, u.avgFinal, u.avgCurrent, u.gain, u.improved, u.currentLulus,
        u.bmiChecked, u.overweight, u.avgWeightDelta, u.remedialPassed, u.replacements]
        .forEach((v, i) => close(v, e[i], `unit ${u.key}[${i}]`));
    }
  });

  test('Laporan Mingguan A–D', () => {
    const l = f.expected.laporan;
    const w = weeklyReport(data, f.expected.week, today);
    for (const r of w.performance) {
      const e = l.performance[r.key];
      [r.staffCount, r.assessed, r.avgThisWeek, r.avgLastWeek, r.changeVsLastWeek, r.baselineAvg, r.gainVsBaseline,
        r.lulus, r.belumLulus, r.pctLulus].forEach((v, i) => close(v, e[i], `A ${r.key}[${i}]`));
    }
    for (const r of w.aspects) {
      const e = l.aspects[r.key];
      Object.values(r.averages).forEach((v, i) => close(v, e[i], `A2 ${r.key}[${i}]`));
      expect(r.knowledgeMet === null ? '' : r.knowledgeMet ? 'Ya' : 'Belum').toBe(blankToNull(e[6]) ?? '');
      expect(r.communicationMet === null ? '' : r.communicationMet ? 'Ya' : 'Belum').toBe(blankToNull(e[7]) ?? '');
    }
    checkActions(w.actionProgress, l.actions, 'B');
    for (const r of w.bmi) {
      const e = l.bmi[r.key];
      [r.staffCount, r.checked, r.notChecked, r.normal, r.kurus, r.overweight, r.obesitas, r.pctOverweight]
        .forEach((v, i) => close(v, e[i], `C ${r.key}[${i}]`));
      close(r.lateChecks, e[9], `C ${r.key} late`);
    }
    for (const r of w.trend) {
      const e = l.trend[r.key];
      r.weeks.forEach((v, i) => close(v, e[i], `D ${r.key} Mg${i + 1}`));
    }
  });
});

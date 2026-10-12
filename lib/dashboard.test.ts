import { describe, expect, test } from 'bun:test';
import {
  currentBmiPeriod,
  dashboardSummary,
  defaultWeek,
  formatPercent,
  parseSort,
  parseWeek,
  phaseOf,
  sortComparison,
  targetText,
} from './dashboard';
import { TODAY, dashboardFixture } from './dashboard.fixture';
import { DEFAULT_SETTINGS as S } from './rules';

const tile = (tiles: { key: string }[], key: string) => tiles.find((t) => t.key === key) as Record<string, unknown>;

describe('programme position', () => {
  test('phase, default week and BMI slot follow the Parameter dates', () => {
    expect(phaseOf(S, '2026-10-04')).toBe('before');
    expect(phaseOf(S, TODAY)).toBe('during');
    expect(phaseOf(S, '2026-12-14')).toBe('after');
    expect(defaultWeek(S, '2026-10-01')).toBe(1);
    expect(defaultWeek(S, TODAY)).toBe(3);
    expect(defaultWeek(S, '2027-01-01')).toBe(S.weeks);
    expect(currentBmiPeriod(S, '2026-10-11')).toBeNull();
    expect(currentBmiPeriod(S, TODAY)).toBe(1);
    expect(currentBmiPeriod(S, '2026-10-26')).toBe(2);
  });

  test('parseWeek accepts only weeks of the programme', () => {
    expect(parseWeek('4', S, TODAY)).toBe(4);
    expect(parseWeek(['2', '5'], S, TODAY)).toBe(2);
    expect(parseWeek('11', S, TODAY)).toBe(3);
    expect(parseWeek('x', S, TODAY)).toBe(3);
    expect(parseWeek(undefined, S, TODAY)).toBe(3);
  });
});

describe('formatting', () => {
  test('percentages keep one decimal, whole numbers stay whole', () => {
    expect(formatPercent(0.3732)).toBe('37,3%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.2)).toBe('20%');
    expect(formatPercent(null)).toBe('');
    expect(targetText({ direction: '<', target: 0.2 })).toBe('Target < 20%');
    expect(targetText({ direction: '>=', target: 1 })).toBe('Target ≥ 100%');
    expect(targetText({ direction: 'baseline', target: null })).toBeNull();
  });
});

describe('dashboardSummary', () => {
  const summary = dashboardSummary(dashboardFixture(), TODAY, ['CGK', 'DPS']);

  test('week and slot of today', () => {
    expect(summary.phase).toBe('during');
    expect(summary.week).toBe(3);
    expect(summary.bmiPeriod).toBe(1);
  });

  test('slide-15 tiles: actual against target and PDF baseline', () => {
    expect(summary.targets.map((t) => t.key)).toEqual(['coverage', 'overweight', 'knowledge', 'interactive', 'kelulusan']);
    expect(tile(summary.targets, 'overweight')).toMatchObject({ value: 0.5, status: 'Belum tercapai', target: 'Target < 20%', baseline: 'Baseline PDF 37,3%' });
    // Mean of aspect B (95, 85) = 90: not above 90 %.
    expect(tile(summary.targets, 'knowledge')).toMatchObject({ value: 0.9, status: 'Belum tercapai' });
    // Passed 2 (one of them withdrawn) + remedial passed 1, of 4 participants.
    expect(tile(summary.targets, 'kelulusan')).toMatchObject({ value: 0.75, status: 'Belum tercapai', link: { sheet: 'remedial' } });
  });

  test('work tiles count what needs doing', () => {
    expect(tile(summary.work, 'tindak-lanjut')).toMatchObject({ value: 1, total: 3, tone: 'critical' });
    expect(tile(summary.work, 'tindak-lanjut').detail).toBe('1 OVERDUE · 1 jatuh tempo ≤ 7 hari');
    // Withdrawn staff are not counted as due for scoring.
    expect(tile(summary.work, 'dinilai')).toMatchObject({ value: 2, total: 3, link: { sheet: 'performa', query: { minggu: 3 } } });
    expect(tile(summary.work, 'bmi-terlambat')).toMatchObject({ value: 1, total: 3, tone: 'critical' });
    expect(tile(summary.work, 'tanpa-remedial')).toMatchObject({ value: 1, total: 2, tone: 'warning' });
  });

  test('before the programme the weekly tile says so instead of 0', () => {
    const before = dashboardSummary(dashboardFixture(), '2026-10-01', ['CGK', 'DPS']);
    const t = tile(before.work, 'dinilai');
    expect(t.value).toBeNull();
    expect(String(t.note)).toContain('Minggu ke-1');
    expect(before.comparison[0].assessed.value).toBeNull();
    expect(before.comparison[0].bmi.checkedThisPeriod).toBeNull();
  });

  test('one row per station plus all stations', () => {
    const [cgk, dps] = summary.comparison;
    expect(cgk).toMatchObject({
      station: 'CGK',
      staffCount: 2,
      assessed: { value: 1, total: 2 },
      bmi: { checkedThisPeriod: 1, everChecked: 1, overweight: 1, pctOverweight: 1, late: 1 },
      training: { passed: 1, failed: 1, remedialPassed: 0, failedNoRemedial: 1, beda: 1 },
    });
    expect(cgk.links.bmi).toEqual({ sheet: 'bmi', query: { stasiun: 'CGK', periode: 1 } });
    expect(dps).toMatchObject({
      staffCount: 2,
      assessed: { value: 1, total: 1 },
      bmi: { late: 0, pctOverweight: 0 },
      training: { passed: 1, failed: 1, remedialPassed: 1, failedNoRemedial: 0 },
    });
    expect(summary.comparisonTotal).toMatchObject({ station: 'TOTAL', staffCount: 4, assessed: { value: 2, total: 3 } });
    expect(summary.comparisonTotal!.links.sdm).toEqual({ sheet: 'sdm', query: { stasiun: null } });
  });

  test('a single station has no total row', () => {
    expect(dashboardSummary(dashboardFixture(), TODAY, ['CGK']).comparisonTotal).toBeNull();
  });
});

describe('sortComparison', () => {
  const rows = dashboardSummary(dashboardFixture(), TODAY, ['DPS', 'CGK']).comparison;
  test('most urgent first, station order on ties', () => {
    expect(sortComparison(rows, 'stasiun').map((r) => r.station)).toEqual(['DPS', 'CGK']);
    expect(sortComparison(rows, 'terlambat').map((r) => r.station)).toEqual(['CGK', 'DPS']);
    expect(sortComparison(rows, 'dinilai').map((r) => r.station)).toEqual(['CGK', 'DPS']);
    expect(sortComparison(rows, 'bmi').map((r) => r.station)).toEqual(['CGK', 'DPS']);
    expect(sortComparison(rows, 'remedial').map((r) => r.station)).toEqual(['CGK', 'DPS']);
  });
  test('parseSort falls back to station order', () => {
    expect(parseSort('bmi')).toBe('bmi');
    expect(parseSort('nope')).toBe('stasiun');
    expect(parseSort(undefined)).toBe('stasiun');
  });
});

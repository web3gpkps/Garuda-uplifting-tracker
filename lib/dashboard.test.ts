import { describe, expect, test } from 'bun:test';
import {
  berandaSummary,
  currentBmiPeriod,
  defaultWeek,
  formatPercent,
  parseWeek,
  phaseOf,
  stationTodo,
  targetText,
} from './dashboard';
import { TODAY, dashboardFixture } from './dashboard.fixture';
import { DEFAULT_SETTINGS as S } from './rules';

describe('programme position', () => {
  test('phase, default week and BMI slot follow the settings dates', () => {
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

describe('berandaSummary', () => {
  const summary = berandaSummary(dashboardFixture(), TODAY, ['DPS', 'CGK']);

  test('week and slot of today', () => {
    expect(summary.phase).toBe('during');
    expect(summary.week).toBe(3);
    expect(summary.bmiPeriod).toBe(1);
  });

  test('station rows, worst first, withdrawn staff left out', () => {
    expect(summary.stations.map((r) => r.station)).toEqual(['CGK', 'DPS']);
    const [cgk, dps] = summary.stations;
    expect(cgk).toMatchObject({ onDuty: 2, assessed: 1, bmiChecked: 1, lateBmi: 1, failed: 1, failedNoRemedial: 1 });
    expect(dps).toMatchObject({ onDuty: 1, assessed: 1, bmiChecked: 1, lateBmi: 0, failed: 1, failedNoRemedial: 0 });
    expect(cgk.links.bmi).toEqual({ sheet: 'bmi', query: { stasiun: 'CGK', periode: 1 } });
    expect(cgk.links.remedial).toEqual({ sheet: 'remedial', query: { stasiun: 'CGK', status: 'Belum dijadwalkan' } });
    expect(summary.total).toMatchObject({ station: 'TOTAL', onDuty: 3, assessed: 2, lateBmi: 1, failedNoRemedial: 1 });
    expect(summary.total.links.performa).toEqual({ sheet: 'performa', query: { stasiun: null, minggu: 3 } });
    expect(summary.actionOverdue).toBe(1);
  });

  test('targets: plain labels, posisi awal, target and current value', () => {
    const overweight = summary.targets.find((t) => t.key === 'overweight');
    expect(overweight).toMatchObject({ label: 'BMI overweight + obesitas', baseline: 0.3732, target: '< 20%', actual: 0.5, status: 'Belum tercapai' });
    // Mean of aspect B (95, 85) = 90: not above 90 %.
    expect(summary.targets.find((t) => t.key === 'knowledge')).toMatchObject({ actual: 0.9, status: 'Belum tercapai' });
    expect(summary.targets.find((t) => t.key === 'passRate')?.target).toBe('Di atas posisi awal');
  });

  test('before the programme nothing is counted for the week', () => {
    const before = berandaSummary(dashboardFixture(), '2026-10-01', ['CGK', 'DPS']);
    expect(before.week).toBeNull();
    expect(before.stations[0].assessed).toBeNull();
    expect(before.stations[0].bmiChecked).toBeNull();
  });
});

describe('stationTodo', () => {
  test('this week: open counts per line, each with its filtered screen', () => {
    const summary = berandaSummary(dashboardFixture(), TODAY, ['CGK']);
    const items = stationTodo(summary, summary.stations[0], S, false);
    expect(items.map((i) => [i.key, i.detail, i.state])).toEqual([
      ['penilaian', '1 dari 2 SDM belum dinilai', 'todo'],
      ['bmi', '1 dari 2 SDM sudah dicek', 'todo'],
      ['remedial', '1 dari 1 peserta Failed', 'todo'],
      ['temuan', 'Belum ditulis', 'todo'],
    ]);
    expect(items[0].link).toEqual({ sheet: 'performa', query: { stasiun: 'CGK', minggu: 3 } });
    expect(items[1].late).toBe(1);
    expect(items[3].link).toEqual({ sheet: 'laporan', query: { stasiun: 'CGK', minggu: 3 } });
  });

  test('done lines say so', () => {
    const summary = berandaSummary(dashboardFixture(), TODAY, ['DPS']);
    const items = stationTodo(summary, summary.stations[0], S, true);
    expect(items.map((i) => i.state)).toEqual(['done', 'done', 'done', 'done']);
    expect(items[2].detail).toBe('Semua 1 peserta Failed sudah dijadwalkan');
  });

  test('before week 1 the list is what to prepare', () => {
    const summary = berandaSummary(dashboardFixture(), '2026-10-01', ['CGK']);
    const items = stationTodo(summary, summary.stations[0], S, false);
    expect(items.map((i) => [i.key, i.state])).toEqual([
      ['catatan-bmi', 'done'],
      ['remedial', 'todo'],
      ['penilaian', 'later'],
      ['bmi', 'later'],
    ]);
    expect(items[2].detail).toContain('5 Okt 2026');
  });
});

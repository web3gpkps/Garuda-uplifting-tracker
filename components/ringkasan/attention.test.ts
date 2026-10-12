import { describe, expect, test } from 'bun:test';
import { staffDerived } from '@/lib/aggregate';
import { TODAY, dashboardFixture } from '@/lib/dashboard.fixture';
import { buildAttention, isQuiet } from './attention';

describe('buildAttention', () => {
  const data = dashboardFixture();
  const a = buildAttention(data, staffDerived(data, TODAY), ['CGK', 'DPS'], TODAY, 3);

  test('action items: overdue first, then due within 7 days', () => {
    expect(a.dueItems.map((d) => [d.code, d.flag, d.daysLeft])).toEqual([
      ['GA-TL01', 'OVERDUE', -5],
      ['GA-TL03', 'Jatuh tempo ≤ 7 hari', 5],
    ]);
  });

  test('staff groups per station, withdrawn staff left out of duty checks', () => {
    expect(a.notScored).toMatchObject({ week: 3, total: 1, of: 3 });
    expect(a.notScored!.stations).toEqual([{ station: 'CGK', of: 2, staff: [{ code: 'IULS-02', name: 'SDM Uji IULS-02' }] }]);
    expect(a.lateBmi).toMatchObject({ total: 1, of: 3 });
    expect(a.lateBmi.stations[0].staff[0].code).toBe('IULS-02');
    expect(a.failedNoRemedial).toMatchObject({ total: 1, of: 2 });
    expect(a.beda).toMatchObject({ total: 1, of: 4 });
    expect(isQuiet(a)).toBe(false);
  });

  test('before the programme there is no weekly scoring gap', () => {
    const before = buildAttention(data, staffDerived(data, '2026-10-01'), ['CGK', 'DPS'], '2026-10-01', null);
    expect(before.notScored).toBeNull();
  });

  test('a station view only lists its own staff', () => {
    const dps = buildAttention(data, staffDerived(data, TODAY), ['DPS'], TODAY, 3);
    expect(dps.lateBmi.total).toBe(0);
    expect(dps.beda.total).toBe(0);
  });
});

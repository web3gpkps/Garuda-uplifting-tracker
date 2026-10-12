import { describe, expect, test } from 'bun:test';
import { FAILED_BY_STATION } from '@/lib/reference';
import { barWidth, failedTotal } from './bars';

describe('barWidth', () => {
  test('share of the maximum, clamped and rounded', () => {
    expect(barWidth(0.3732, 0.3732)).toBe(100);
    expect(barWidth(0.1118, 0.3732)).toBe(30);
    expect(barWidth(2, 1)).toBe(100);
    expect(barWidth(-1, 1)).toBe(0);
    expect(barWidth(null, 1)).toBe(0);
    expect(barWidth(1, 0)).toBe(0);
  });
});

describe('failedTotal', () => {
  test('a station missing from one chart counts 0 there', () => {
    expect(failedTotal({ iuls: null, rust: 7 })).toBe(7);
    expect(failedTotal(FAILED_BY_STATION[0])).toBe(21);
  });
});

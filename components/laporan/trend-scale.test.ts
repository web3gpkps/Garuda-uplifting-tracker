import { describe, expect, test } from 'bun:test';
import { trendScale } from './trend-scale';

describe('trendScale', () => {
  test('starts at the round ten below the passing grade when scores are higher', () => {
    expect(trendScale([88, 92, null], 85)).toEqual({ min: 80, max: 100, ticks: [80, 90, 100] });
  });
  test('reaches down to low scores, with coarser ticks on a long axis', () => {
    expect(trendScale([42, 90], 85)).toEqual({ min: 30, max: 100, ticks: [30, 40, 60, 80, 100] });
  });
  test('no scores: axis around the passing grade', () => {
    expect(trendScale([], 85).min).toBe(80);
    expect(trendScale([0], 85).min).toBe(0);
  });
});

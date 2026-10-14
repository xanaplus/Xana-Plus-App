import { describe, expect, it } from 'vitest';
import { spendingBreakdown } from '../../src/lib/spending-breakdown.ts';

const item = (id, total) => ({ id, label: id, total });
describe('recorded department spending composition', () => {
  it('uses recorded amounts, preserves cents and computes shares of item spending', () => {
    const chart = spendingBreakdown([item('groceries', 0.1), item('deli', 0.2)]);
    expect(chart.total).toBe(0.3);
    expect(chart.segments.map(s => s.total)).toEqual([0.2, 0.1]);
    expect(chart.segments.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
  });
  it('renders a full ring for a single department', () => {
    expect(spendingBreakdown([item('pharmacy', 230)]).segments[0].share).toBe(1);
  });
  it('has an explicit empty breakdown for zero values', () => {
    expect(spendingBreakdown([])).toEqual({ total: 0, segments: [] });
    expect(spendingBreakdown([item('deli', 0)])).toEqual({ total: 0, segments: [] });
  });
  it('keeps exactly five departments separate and leaves input unchanged', () => {
    const values = ['a', 'b', 'c', 'd', 'e'].map((id, i) => item(id, i + 1));
    const copy = structuredClone(values);
    const chart = spendingBreakdown(values);
    expect(chart.segments).toHaveLength(5);
    expect(chart.segments.every(s => !s.members)).toBe(true);
    expect(values).toEqual(copy);
  });
  it('groups many departments without losing member amounts or percentages', () => {
    const values = 'abcdefgh'.split('').map(id => item(id, 10));
    const chart = spendingBreakdown(values);
    expect(chart.total).toBe(80);
    expect(chart.segments).toHaveLength(5);
    expect(chart.segments[4]).toMatchObject({ id: 'other', total: 40, share: 0.5 });
    expect(chart.segments[4].members).toHaveLength(4);
    expect(chart.segments.reduce((sum, s) => sum + s.total, 0)).toBe(chart.total);
  });
  it('keeps unknown item spending explicit and never invents a department', () => {
    const chart = spendingBreakdown([item('groceries', 30), item('unclassified', 20)]);
    expect(chart.total).toBe(50);
    expect(chart.segments[1]).toMatchObject({ id: 'unclassified', total: 20, share: 0.4 });
  });
  it('retains tiny real slices without padding their money or shares', () => {
    const chart = spendingBreakdown([item('groceries', 1_000_000), item('deli', 0.01)]);
    expect(chart.segments[1].total).toBe(0.01);
    expect(chart.segments[1].share).toBeGreaterThan(0);
    expect(chart.segments[1].share).toBeLessThan(0.000001);
  });
  it('does not silently turn invalid financial data into spending', () => {
    for (const total of [-1, NaN, Infinity]) {
      expect(() => spendingBreakdown([item('groceries', total)])).toThrow(/recorded amounts/);
    }
  });
});

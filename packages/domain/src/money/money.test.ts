import { describe, expect, it } from 'vitest';
import {
  allocate,
  applyBasisPoints,
  assertHalalas,
  fromSar,
  MoneyError,
  multiply,
  roundHalfUp,
  sum,
  toSar,
} from './money';

describe('roundHalfUp', () => {
  it.each([
    [0.5, 1],
    [1.4999, 1],
    [2.5, 3],
    [-2.5, -3],
    [-0.4, 0],
    [100.49999999999, 100],
  ])('rounds %d to %d', (input, expected) => {
    expect(roundHalfUp(input)).toBe(expected);
  });

  it('compensates for floating-point artefacts', () => {
    expect(roundHalfUp(1.005 * 100)).toBe(101);
  });

  it('never returns negative zero', () => {
    expect(Object.is(roundHalfUp(-0.2), 0)).toBe(true);
  });

  it('rejects non-finite input', () => {
    expect(() => roundHalfUp(Number.NaN)).toThrow(MoneyError);
    expect(() => roundHalfUp(Infinity)).toThrow(MoneyError);
  });
});

describe('conversions', () => {
  it('converts SAR to halalas and back', () => {
    expect(fromSar(149.99)).toBe(14999);
    expect(fromSar(0.1 + 0.2)).toBe(30);
    expect(toSar(14999)).toBe(149.99);
  });

  it('assertHalalas rejects fractional halalas', () => {
    expect(() => assertHalalas(1.5)).toThrow(/integer number of halalas/);
    expect(assertHalalas(15)).toBe(15);
  });
});

describe('arithmetic', () => {
  it('multiplies with half-up rounding', () => {
    expect(multiply(1000, 2.345)).toBe(2345);
    expect(multiply(333, 1.5)).toBe(500);
  });

  it('applies basis points', () => {
    expect(applyBasisPoints(10_000, 1500)).toBe(1500);
    expect(applyBasisPoints(333, 1500)).toBe(50); // 49.95 → 50
    expect(() => applyBasisPoints(100, 1.5)).toThrow(MoneyError);
  });

  it('sums integer amounts', () => {
    expect(sum([100, 250, -50])).toBe(300);
    expect(sum([])).toBe(0);
    expect(() => sum([1, 0.5])).toThrow(MoneyError);
  });
});

describe('allocate', () => {
  it('splits without losing halalas', () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('splits proportionally to weights', () => {
    expect(allocate(1000, [3000, 1000])).toEqual([750, 250]);
  });

  it('gives remainders to the largest fractional parts first', () => {
    expect(allocate(10, [1, 2, 2])).toEqual([2, 4, 4]);
    expect(allocate(7, [1, 1, 1, 1])).toEqual([2, 2, 2, 1]);
  });

  it('handles negative totals symmetrically', () => {
    expect(allocate(-1000, [1, 1, 1])).toEqual([-334, -333, -333]);
  });

  it('splits evenly when all weights are zero', () => {
    expect(allocate(5, [0, 0])).toEqual([3, 2]);
  });

  it('keeps zero parts as positive zero', () => {
    const parts = allocate(-1, [1, 0]);
    expect(parts).toEqual([-1, 0]);
    expect(Object.is(parts[1], 0)).toBe(true);
  });

  it('validates input', () => {
    expect(() => allocate(100, [])).toThrow(MoneyError);
    expect(() => allocate(100, [-1, 2])).toThrow(MoneyError);
    expect(() => allocate(100, [Number.NaN])).toThrow(MoneyError);
    expect(() => allocate(1.5, [1])).toThrow(MoneyError);
  });
});

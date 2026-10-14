/**
 * Money is represented as integer halalas (1 SAR = 100 halalas) everywhere in the system.
 * These helpers are the only place where fractional arithmetic touches money.
 */
export type Halalas = number;

export const HALALAS_PER_SAR = 100;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function assertHalalas(value: number, label = 'amount'): Halalas {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of halalas, got ${value}`);
  }
  return value;
}

/** Round half away from zero, tolerant of binary floating-point artefacts (e.g. 1.005). */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) throw new MoneyError(`Cannot round non-finite value ${value}`);
  const sign = value < 0 ? -1 : 1;
  // Scale by (1 + EPSILON) so values such as 1.005 * 100 = 100.49999999999999 round as intended.
  const rounded = Math.floor(Math.abs(value) * (1 + Number.EPSILON) + 0.5);
  return rounded === 0 ? 0 : sign * rounded;
}

/** Convert a decimal SAR amount (e.g. 149.99) to halalas. */
export function fromSar(sar: number): Halalas {
  return roundHalfUp(sar * HALALAS_PER_SAR);
}

/** Convert halalas to a decimal SAR number. For display use the i18n formatters instead. */
export function toSar(halalas: Halalas): number {
  assertHalalas(halalas);
  return halalas / HALALAS_PER_SAR;
}

/** Multiply an amount by a (possibly fractional) factor, rounding half-up to the halala. */
export function multiply(halalas: Halalas, factor: number): Halalas {
  assertHalalas(halalas);
  return roundHalfUp(halalas * factor);
}

/** Apply basis points (1 bp = 0.01%). 1500 bp = 15%. */
export function applyBasisPoints(halalas: Halalas, bp: number): Halalas {
  assertHalalas(halalas);
  assertHalalas(bp, 'basis points');
  return roundHalfUp((halalas * bp) / 10_000);
}

export function sum(amounts: readonly Halalas[]): Halalas {
  return amounts.reduce<number>((acc, a) => acc + assertHalalas(a), 0);
}

/**
 * Split `total` proportionally to `weights` without losing or creating a single halala
 * (largest-remainder method). Used to spread order-level discounts across lines.
 */
export function allocate(total: Halalas, weights: readonly number[]): Halalas[] {
  assertHalalas(total);
  if (weights.length === 0) throw new MoneyError('allocate() needs at least one weight');
  if (weights.some((w) => w < 0 || !Number.isFinite(w))) {
    throw new MoneyError('allocate() weights must be finite and non-negative');
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) return allocate(total, weights.map(() => 1));

  const sign = total < 0 ? -1 : 1;
  const absTotal = Math.abs(total);
  const raw = weights.map((w) => (absTotal * w) / weightSum);
  const parts = raw.map((r) => Math.floor(r));
  let remainder = absTotal - parts.reduce((a, b) => a + b, 0);
  const byFraction = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of byFraction) {
    if (remainder === 0) break;
    parts[i] = parts[i]! + 1;
    remainder -= 1;
  }
  return parts.map((p) => (p === 0 ? 0 : sign * p));
}

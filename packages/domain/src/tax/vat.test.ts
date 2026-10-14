import { describe, expect, it } from 'vitest';
import { computeLineVat, SA_STANDARD_VAT_BP, summarizeVat, VatError } from './vat';

describe('computeLineVat — VAT-inclusive prices', () => {
  it('extracts 15% VAT from an inclusive price', () => {
    // 115.00 SAR inclusive → 100.00 net + 15.00 VAT
    expect(
      computeLineVat({ unitPrice: 11500, quantity: 1, rateBp: 1500, pricesIncludeVat: true }),
    ).toEqual({ net: 10000, vat: 1500, gross: 11500, rateBp: 1500 });
  });

  it('rounds net half-up and derives VAT so net + VAT equals gross exactly', () => {
    // 99.99 SAR → net 86.947… → 86.95, VAT 13.04
    const r = computeLineVat({ unitPrice: 9999, quantity: 1, rateBp: 1500, pricesIncludeVat: true });
    expect(r).toEqual({ net: 8695, vat: 1304, gross: 9999, rateBp: 1500 });
  });

  it('applies quantity and discount before extracting VAT', () => {
    const r = computeLineVat({
      unitPrice: 23000,
      quantity: 3,
      discount: 6900,
      rateBp: SA_STANDARD_VAT_BP,
      pricesIncludeVat: true,
    });
    expect(r.gross).toBe(62100);
    expect(r.net + r.vat).toBe(62100);
    expect(r.net).toBe(54000);
  });
});

describe('computeLineVat — VAT-exclusive prices', () => {
  it('adds 15% VAT on top', () => {
    expect(
      computeLineVat({ unitPrice: 10000, quantity: 2, rateBp: 1500, pricesIncludeVat: false }),
    ).toEqual({ net: 20000, vat: 3000, gross: 23000, rateBp: 1500 });
  });

  it('rounds VAT half-up', () => {
    // 3.33 × 15% = 0.4995 → 0.50
    const r = computeLineVat({ unitPrice: 333, quantity: 1, rateBp: 1500, pricesIncludeVat: false });
    expect(r.vat).toBe(50);
  });

  it('supports zero-rated lines', () => {
    const r = computeLineVat({ unitPrice: 5000, quantity: 1, rateBp: 0, pricesIncludeVat: false });
    expect(r).toEqual({ net: 5000, vat: 0, gross: 5000, rateBp: 0 });
  });
});

describe('computeLineVat — validation', () => {
  const base = { unitPrice: 1000, quantity: 1, rateBp: 1500, pricesIncludeVat: true };

  it.each([0, -1, 1.5])('rejects quantity %d', (quantity) => {
    expect(() => computeLineVat({ ...base, quantity })).toThrow(VatError);
  });

  it.each([-1, 10_001, 15.5])('rejects rateBp %d', (rateBp) => {
    expect(() => computeLineVat({ ...base, rateBp })).toThrow(VatError);
  });

  it('rejects discounts larger than the line', () => {
    expect(() => computeLineVat({ ...base, discount: 1001 })).toThrow(/discount exceeds/);
  });

  it('rejects negative amounts', () => {
    expect(() => computeLineVat({ ...base, unitPrice: -1 })).toThrow(VatError);
    expect(() => computeLineVat({ ...base, discount: -1 })).toThrow(VatError);
  });

  it('rejects fractional halalas', () => {
    expect(() => computeLineVat({ ...base, unitPrice: 10.5 })).toThrow();
  });
});

describe('summarizeVat', () => {
  it('sums lines and groups by rate, highest rate first', () => {
    const lines = [
      computeLineVat({ unitPrice: 11500, quantity: 1, rateBp: 1500, pricesIncludeVat: true }),
      computeLineVat({ unitPrice: 9999, quantity: 1, rateBp: 1500, pricesIncludeVat: true }),
      computeLineVat({ unitPrice: 2000, quantity: 1, rateBp: 0, pricesIncludeVat: true }),
    ];
    const s = summarizeVat(lines);
    expect(s.gross).toBe(11500 + 9999 + 2000);
    expect(s.vat).toBe(1500 + 1304);
    expect(s.net + s.vat).toBe(s.gross);
    expect(s.byRate).toEqual([
      { rateBp: 1500, net: 18695, vat: 2804 },
      { rateBp: 0, net: 2000, vat: 0 },
    ]);
  });

  it('handles an empty document', () => {
    expect(summarizeVat([])).toEqual({ net: 0, vat: 0, gross: 0, byRate: [] });
  });
});

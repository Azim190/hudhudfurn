import { describe, expect, it } from 'vitest';
import { codEligibility, shippingOptions, zoneForCity, type ShippingRateInput, type ShippingZoneInput } from './shipping';

const rate = (over: Partial<ShippingRateInput> = {}): ShippingRateInput => ({
  id: 'std',
  carrier: 'SMSA',
  method: 'STANDARD',
  nameAr: 'توصيل عادي',
  nameEn: 'Standard delivery',
  minWeightG: 0,
  maxWeightG: null,
  price: 2500,
  freeAbove: 30000,
  etaMinDays: 2,
  etaMaxDays: 4,
  ...over,
});

const zones: ShippingZoneInput[] = [
  { id: 'riyadh', cityCodes: ['RUH'], rates: [rate({ id: 'same', method: 'SAME_DAY', price: 4500, freeAbove: null, etaMinDays: 0, etaMaxDays: 1 }), rate({ price: 1500 })] },
  {
    id: 'rest',
    cityCodes: ['*'],
    rates: [rate({ maxWeightG: 10000 }), rate({ id: 'heavy', minWeightG: 10001, price: 6000, freeAbove: null })],
  },
];

const base = { zones, cityCode: 'RUH', weightG: 2000, goodsTotal: 10000, freeShipping: false };

describe('zoneForCity', () => {
  it('matches a listed city, then falls back to the catch-all zone', () => {
    expect(zoneForCity(zones, 'RUH')?.id).toBe('riyadh');
    expect(zoneForCity(zones, 'JED')?.id).toBe('rest');
    expect(zoneForCity([zones[0]!], 'JED')).toBeUndefined();
  });
});

describe('shippingOptions', () => {
  it('lists the zone rates, cheapest first', () => {
    const opts = shippingOptions(base);
    expect(opts.map((o) => o.rateId)).toEqual(['std', 'same']);
    expect(opts[0]).toMatchObject({ zoneId: 'riyadh', price: 1500, listPrice: 1500, etaMinDays: 2, etaMaxDays: 4 });
  });

  it('makes rates free above their threshold or with a free-shipping promotion', () => {
    expect(shippingOptions({ ...base, goodsTotal: 30000 }).find((o) => o.rateId === 'std')!.price).toBe(0);
    const promo = shippingOptions({ ...base, freeShipping: true });
    expect(promo.every((o) => o.price === 0)).toBe(true);
    expect(promo.find((o) => o.rateId === 'same')!.listPrice).toBe(4500);
  });

  it('selects rates by weight band', () => {
    expect(shippingOptions({ ...base, cityCode: 'DMM', weightG: 10000 }).map((o) => o.rateId)).toEqual(['std']);
    expect(shippingOptions({ ...base, cityCode: 'DMM', weightG: 15000 }).map((o) => o.rateId)).toEqual(['heavy']);
    expect(shippingOptions({ ...base, cityCode: 'DMM', weightG: -5 }).map((o) => o.rateId)).toEqual(['std']);
  });

  it('adds production time to every option', () => {
    const opts = shippingOptions({ ...base, productionDays: { min: 5, max: 7 } });
    expect(opts[1]).toMatchObject({ etaMinDays: 5, etaMaxDays: 8 });
  });

  it('breaks price ties by speed', () => {
    const tie: ShippingZoneInput[] = [{ id: 'z', cityCodes: ['*'], rates: [rate({ id: 'slow', etaMaxDays: 6 }), rate({ id: 'fast', etaMaxDays: 2 })] }];
    expect(shippingOptions({ ...base, zones: tie }).map((o) => o.rateId)).toEqual(['fast', 'slow']);
  });

  it('returns no options when no zone covers the city', () => {
    expect(shippingOptions({ ...base, zones: [zones[0]!], cityCode: 'TIF' })).toEqual([]);
  });
});

describe('codEligibility', () => {
  const rules = { enabled: true, fee: 1500, maxTotal: 300000, allowMadeToMeasure: false };
  const ok = { cityCodAllowed: true, hasMadeToMeasure: false, total: 50000, isPickup: false };

  it('allows eligible orders and returns the fee', () => {
    expect(codEligibility(rules, ok)).toEqual({ allowed: true, fee: 1500 });
  });

  it.each([
    ['disabled', { ...rules, enabled: false }, ok],
    ['pickup', rules, { ...ok, isPickup: true }],
    ['city', rules, { ...ok, cityCodAllowed: false }],
    ['madeToMeasure', rules, { ...ok, hasMadeToMeasure: true }],
    ['amount', rules, { ...ok, total: 299000 }],
  ] as const)('rejects with %s', (reason, r, input) => {
    expect(codEligibility(r, input)).toEqual({ allowed: false, reason });
  });

  it('allows made-to-measure when configured', () => {
    expect(codEligibility({ ...rules, allowMadeToMeasure: true }, { ...ok, hasMadeToMeasure: true }).allowed).toBe(true);
  });
});

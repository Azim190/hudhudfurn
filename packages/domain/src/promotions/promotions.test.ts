import { describe, expect, it } from 'vitest';
import { applyPromotions, PromotionError, validatePromotion, type PromotionLine, type PromotionRule } from './promotions';

const line = (over: Partial<PromotionLine> = {}): PromotionLine => ({
  id: 'a',
  productId: 'p1',
  categoryIds: ['c-bedding', 'c-root'],
  vertical: 'BEDDING',
  unitPrice: 10000,
  quantity: 1,
  ...over,
});
const rule = (over: Partial<PromotionRule> = {}): PromotionRule => ({
  id: 'r1',
  type: 'PERCENT',
  automatic: true,
  priority: 0,
  stackable: true,
  conditions: {},
  benefit: { percent: 10 },
  ...over,
});
const ctx = { isFirstOrder: false };
const sumOf = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe('validatePromotion', () => {
  it('accepts well-formed rules', () => {
    expect(() => validatePromotion(rule({ benefit: { percent: 10, maxDiscount: 5000 } }))).not.toThrow();
    expect(() => validatePromotion(rule({ type: 'FREE_SHIPPING', benefit: {} }))).not.toThrow();
    expect(() => validatePromotion(rule({ type: 'BXGY', benefit: { buyQuantity: 2, getQuantity: 1, getPercent: 50 } }))).not.toThrow();
  });

  it.each([
    ['PERCENT', { percent: 0 }],
    ['PERCENT', { percent: 101 }],
    ['PERCENT', {}],
    ['PERCENT', { percent: 10, maxDiscount: 1.5 }],
    ['FIXED', { amount: 0 }],
    ['FIXED', { amount: 10.5 }],
    ['BXGY', { buyQuantity: 2 }],
    ['BXGY', { buyQuantity: 1, getQuantity: 1, getPercent: 0 }],
    ['BXGY', { buyQuantity: 1, getQuantity: 1, getPercent: 120 }],
    ['BUNDLE', { bundleQuantity: 1, bundlePrice: 100 }],
    ['BUNDLE', { bundleQuantity: 3 }],
    ['BUNDLE', { bundleQuantity: 3, bundlePrice: -1 }],
  ] as const)('rejects %s %j', (type, benefit) => {
    expect(() => validatePromotion(rule({ type, benefit: { ...benefit } }))).toThrow();
  });

  it('throws a PromotionError for invalid benefits', () => {
    expect(() => validatePromotion(rule({ type: 'FIXED', benefit: {} }))).toThrow(PromotionError);
  });
});

describe('applyPromotions', () => {
  it('returns nothing without rules', () => {
    expect(applyPromotions([line()], [], ctx)).toEqual({ applied: [], lineDiscounts: {}, discount: 0, freeShipping: false });
  });

  it('applies a percentage spread across lines without losing halalas', () => {
    const lines = [line({ id: 'a', unitPrice: 3333 }), line({ id: 'b', unitPrice: 3333 }), line({ id: 'c', unitPrice: 3334 })];
    const r = applyPromotions(lines, [rule({ benefit: { percent: 15 } })], ctx);
    expect(r.discount).toBe(1500);
    expect(sumOf(r.lineDiscounts)).toBe(1500);
  });

  it('caps a percentage discount', () => {
    const r = applyPromotions([line({ unitPrice: 100000 })], [rule({ benefit: { percent: 20, maxDiscount: 5000 } })], ctx);
    expect(r.discount).toBe(5000);
  });

  it('never discounts more than the eligible goods for fixed amounts', () => {
    const r = applyPromotions([line({ unitPrice: 3000 })], [rule({ type: 'FIXED', benefit: { amount: 5000 } })], ctx);
    expect(r.discount).toBe(3000);
    expect(r.lineDiscounts).toEqual({ a: 3000 });
  });

  it('scopes rules by product, category and vertical, and skips excluded lines', () => {
    const lines = [
      line({ id: 'a', productId: 'p1' }),
      line({ id: 'b', productId: 'p2', categoryIds: ['c-curtains'], vertical: 'CURTAINS' }),
      line({ id: 'c', productId: 'p3', categoryIds: ['c-abaya'], vertical: 'ABAYAS' }),
      line({ id: 's', productId: 'p1', excluded: true }),
    ];
    expect(Object.keys(applyPromotions(lines, [rule({ conditions: { productIds: ['p1'] } })], ctx).lineDiscounts)).toEqual(['a']);
    expect(Object.keys(applyPromotions(lines, [rule({ conditions: { categoryIds: ['c-curtains'] } })], ctx).lineDiscounts)).toEqual(['b']);
    expect(Object.keys(applyPromotions(lines, [rule({ conditions: { verticals: ['ABAYAS'] } })], ctx).lineDiscounts)).toEqual(['c']);
    expect(Object.keys(applyPromotions(lines, [rule()], ctx).lineDiscounts).sort()).toEqual(['a', 'b', 'c']);
  });

  it('enforces the minimum subtotal on eligible goods', () => {
    const coupon = rule({ code: 'SAVE', automatic: false, conditions: { minSubtotal: 20000 } });
    expect(applyPromotions([line()], [coupon], ctx)).toMatchObject({ discount: 0, couponRejected: 'minSubtotal' });
    expect(applyPromotions([line({ quantity: 2 })], [coupon], ctx).discount).toBe(2000);
  });

  it('reports coupons that match no line', () => {
    const coupon = rule({ code: 'X', conditions: { productIds: ['nope'] } });
    expect(applyPromotions([line()], [coupon], ctx).couponRejected).toBe('notEligible');
  });

  it('restricts first-order promotions', () => {
    const welcome = rule({ code: 'WELCOME', conditions: { firstOrderOnly: true } });
    expect(applyPromotions([line()], [welcome], ctx).couponRejected).toBe('firstOrderOnly');
    expect(applyPromotions([line()], [welcome], { isFirstOrder: true }).discount).toBe(1000);
  });

  it('applies the coupon before automatic promotions and stacks on the remainder', () => {
    const auto = rule({ id: 'auto', priority: 10, benefit: { percent: 10 } });
    const coupon = rule({ id: 'cpn', code: 'C10', automatic: false, type: 'FIXED', benefit: { amount: 2000 } });
    const r = applyPromotions([line()], [auto, coupon], ctx);
    expect(r.applied.map((a) => a.promotionId)).toEqual(['cpn', 'auto']);
    // 2000 off, then 10% of the remaining 8000.
    expect(r.discount).toBe(2800);
  });

  it('orders automatic promotions by priority, then id', () => {
    const r = applyPromotions([line()], [rule({ id: 'b', priority: 1 }), rule({ id: 'a', priority: 1 }), rule({ id: 'c', priority: 5 })], ctx);
    expect(r.applied.map((a) => a.promotionId)).toEqual(['c', 'a', 'b']);
  });

  it('lets a non-stackable promotion lock out later ones', () => {
    const exclusive = rule({ id: 'x', priority: 10, stackable: false, benefit: { percent: 30 } });
    const r = applyPromotions([line()], [exclusive, rule({ id: 'y' })], ctx);
    expect(r.applied.map((a) => a.promotionId)).toEqual(['x']);
    expect(r.discount).toBe(3000);
  });

  it('rejects a non-stackable automatic promotion after another discount, and a coupon after a lock', () => {
    const first = rule({ id: 'first', priority: 10 });
    const exclusive = rule({ id: 'excl', priority: 1, stackable: false });
    expect(applyPromotions([line()], [first, exclusive], ctx).applied.map((a) => a.promotionId)).toEqual(['first']);

    const lockingCoupon = rule({ id: 'lock', code: 'ONLY', stackable: false });
    const r = applyPromotions([line()], [lockingCoupon, rule({ id: 'auto' })], ctx);
    expect(r.applied.map((a) => a.promotionId)).toEqual(['lock']);
    expect(r.couponRejected).toBeUndefined();
  });

  it('marks a non-stackable coupon as not combinable when an earlier discount exists', () => {
    // Two coupons: the second cannot combine with the first.
    const a = rule({ id: 'a', code: 'A', stackable: true });
    const b = rule({ id: 'b', code: 'B', stackable: false });
    expect(applyPromotions([line()], [a, b], ctx).couponRejected).toBe('notCombinable');
  });

  it('combines free shipping with exclusive discounts', () => {
    const exclusive = rule({ id: 'x', priority: 10, stackable: false });
    const ship = rule({ id: 'ship', type: 'FREE_SHIPPING', benefit: {}, stackable: false });
    const r = applyPromotions([line()], [exclusive, ship], ctx);
    expect(r.freeShipping).toBe(true);
    expect(r.discount).toBe(1000);
    expect(r.applied).toHaveLength(2);
  });

  it('gives the cheapest unit free in buy-x-get-y', () => {
    const lines = [line({ id: 'a', unitPrice: 20000, quantity: 2 }), line({ id: 'b', unitPrice: 5000 })];
    const r = applyPromotions(lines, [rule({ type: 'BXGY', benefit: { buyQuantity: 2, getQuantity: 1 } })], ctx);
    expect(r.lineDiscounts).toEqual({ b: 5000 });
  });

  it('applies buy-x-get-y per complete group and supports partial discounts', () => {
    const lines = [line({ unitPrice: 10000, quantity: 5 })];
    const r = applyPromotions(lines, [rule({ type: 'BXGY', benefit: { buyQuantity: 1, getQuantity: 1, getPercent: 50 } })], ctx);
    // Groups of 2: two complete groups, each gives one unit at 50% off.
    expect(r.discount).toBe(10000);
  });

  it('does not apply buy-x-get-y without a complete group', () => {
    const coupon = rule({ code: 'B2G1', type: 'BXGY', benefit: { buyQuantity: 2, getQuantity: 1 } });
    expect(applyPromotions([line({ quantity: 2 })], [coupon], ctx)).toMatchObject({ discount: 0, couponRejected: 'notEligible' });
  });

  it('prices complete bundles at the bundle price', () => {
    const lines = [line({ id: 'a', unitPrice: 30000 }), line({ id: 'b', unitPrice: 20000 }), line({ id: 'c', unitPrice: 10000, quantity: 2 })];
    const r = applyPromotions(lines, [rule({ type: 'BUNDLE', benefit: { bundleQuantity: 3, bundlePrice: 50000 } })], ctx);
    // The three most expensive units (300+200+100) form the set; one unit is left over.
    expect(r.discount).toBe(10000);
    expect(sumOf(r.lineDiscounts)).toBe(10000);
    expect(Object.keys(r.lineDiscounts).sort()).toEqual(['a', 'b', 'c']);
  });

  it('skips bundles that would not save money', () => {
    const coupon = rule({ code: 'SET', type: 'BUNDLE', benefit: { bundleQuantity: 2, bundlePrice: 50000 } });
    expect(applyPromotions([line({ quantity: 2 })], [coupon], ctx).couponRejected).toBe('notEligible');
  });

  it('only counts what is left of a line after earlier promotions', () => {
    const full = rule({ id: 'full', priority: 10, type: 'FIXED', benefit: { amount: 10000 } });
    const r = applyPromotions([line()], [full, rule({ id: 'more', code: undefined })], ctx);
    expect(r.discount).toBe(10000);
    expect(r.applied.map((a) => a.promotionId)).toEqual(['full']);
  });

  it('validates rules before applying them', () => {
    expect(() => applyPromotions([line()], [rule({ benefit: { percent: 0 } })], ctx)).toThrow(PromotionError);
  });
});

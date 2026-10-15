import { describe, expect, it } from 'vitest';
import { CartPricingError, priceCart, priceCartLineUnit, type CartLineInput } from './cart-pricing';

const settings = { vatRateBp: 1500, pricesIncludeVat: true, giftWrapPrice: 1500 };
const fixed = (over: Partial<CartLineInput> = {}): CartLineInput => ({ id: 'a', pricingMode: 'FIXED', unitPrice: 29900, quantity: 1, ...over });

describe('priceCart', () => {
  it('prices fixed items with VAT extracted from inclusive prices', () => {
    const cart = priceCart([fixed({ quantity: 2 }), fixed({ id: 'b', unitPrice: 11500 })], settings);
    expect(cart.subtotal).toBe(29900 * 2 + 11500);
    expect(cart.total).toBe(cart.subtotal);
    expect(cart.vat + cart.net).toBe(cart.total);
    expect(cart.itemCount).toBe(3);
    expect(cart.lines[1]!.vat).toMatchObject({ net: 10000, vat: 1500 });
  });

  it('adds gift wrapping per wrapped unit and taxes it', () => {
    const cart = priceCart([fixed({ quantity: 2, giftWrap: true })], settings);
    expect(cart.giftWrap).toBe(3000);
    expect(cart.total).toBe(29900 * 2 + 3000);
    expect(cart.lines[0]!.total).toBe(62800);
  });

  it('ignores gift wrapping when the module is off or for samples', () => {
    expect(priceCart([fixed({ giftWrap: true })], { ...settings, giftWrapPrice: null }).giftWrap).toBe(0);
    const sample = priceCart([fixed({ isSample: true, samplePrice: 0, giftWrap: true })], settings);
    expect(sample.total).toBe(0);
  });

  it('prices blinds by area and fabric by length', () => {
    const blind = priceCart([{ id: 'b', pricingMode: 'PER_SQM', unitPrice: 15900, quantity: 2, widthMm: 1200, heightMm: 1500 }], settings);
    expect(blind.lines[0]).toMatchObject({ unitPrice: 28620, billedMeasure: 18000, total: 57240 });
    const fabric = priceCart([{ id: 'f', pricingMode: 'PER_METER', unitPrice: 4500, quantity: 1, lengthCm: 233 }], settings);
    expect(fabric.lines[0]).toMatchObject({ unitPrice: 10800, billedMeasure: 240 });
  });

  it('applies line discounts before VAT', () => {
    const cart = priceCart([fixed({ discount: 2990 })], settings);
    expect(cart.discount).toBe(2990);
    expect(cart.total).toBe(26910);
  });

  it('supports VAT-exclusive pricing', () => {
    const cart = priceCart([fixed({ unitPrice: 10000 })], { ...settings, pricesIncludeVat: false });
    expect(cart).toMatchObject({ subtotal: 10000, vat: 1500, total: 11500 });
  });

  it('handles an empty cart', () => {
    expect(priceCart([], settings)).toMatchObject({ lines: [], subtotal: 0, total: 0, itemCount: 0 });
  });

  it('rejects invalid lines with the offending line id', () => {
    const cases: CartLineInput[] = [
      fixed({ quantity: 0 }),
      fixed({ discount: 99_999_999 }),
      fixed({ discount: -1 }),
      { id: 'a', pricingMode: 'CALCULATED', unitPrice: 100, quantity: 1 },
      { id: 'a', pricingMode: 'PER_SQM', unitPrice: 100, quantity: 1, widthMm: 1000 },
      { id: 'a', pricingMode: 'PER_METER', unitPrice: 100, quantity: 1 },
      fixed({ isSample: true, samplePrice: null }),
    ];
    for (const line of cases) {
      const err = (() => {
        try {
          priceCart([line], settings);
        } catch (e) {
          return e;
        }
      })();
      expect(err).toBeInstanceOf(CartPricingError);
      expect((err as CartPricingError).lineId).toBe('a');
    }
  });

  it('priceCartLineUnit exposes the unit price for previews', () => {
    expect(priceCartLineUnit(fixed({ isSample: true, samplePrice: 1000 }))).toEqual({ unitPrice: 1000 });
  });
});

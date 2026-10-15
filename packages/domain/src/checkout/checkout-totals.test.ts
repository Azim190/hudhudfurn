import { describe, expect, it } from 'vitest';
import type { CartLineInput } from '../cart/cart-pricing';
import { computeCheckoutTotals } from './checkout-totals';

const settings = { vatRateBp: 1500, pricesIncludeVat: true, giftWrapPrice: 1500 };
const fixed = (over: Partial<CartLineInput> = {}): CartLineInput => ({ id: 'a', pricingMode: 'FIXED', unitPrice: 11500, quantity: 1, ...over });

describe('computeCheckoutTotals', () => {
  it('adds taxable shipping and COD fee to the goods', () => {
    const t = computeCheckoutTotals({ lines: [fixed({ quantity: 2 })], lineDiscounts: {}, shipping: 2300, codFee: 1150, settings });
    expect(t.subtotal).toBe(23000);
    expect(t.shippingTotal).toBe(2300);
    expect(t.codFeeTotal).toBe(1150);
    expect(t.total).toBe(23000 + 2300 + 1150);
    expect(t.shipping).toMatchObject({ net: 2000, vat: 300 });
    expect(t.codFee).toMatchObject({ net: 1000, vat: 150 });
    expect(t.vat).toBe(3000 + 300 + 150);
    expect(t.net + t.vat).toBe(t.total);
    expect(t.vatBreakdown).toEqual([{ rateBp: 1500, net: t.net, vat: t.vat }]);
  });

  it('applies promotion discounts per line, gift wrap and free shipping', () => {
    const t = computeCheckoutTotals({
      lines: [fixed(), fixed({ id: 'b', unitPrice: 23000, giftWrap: true })],
      lineDiscounts: { b: 3000, ghost: 999 },
      shipping: 0,
      codFee: 0,
      settings,
    });
    expect(t.discount).toBe(3000);
    expect(t.giftWrap).toBe(1500);
    expect(t.total).toBe(11500 + 23000 - 3000 + 1500);
    expect(t.cart.lines[1]!.discount).toBe(3000);
    expect(t.shipping).toMatchObject({ net: 0, vat: 0, gross: 0 });
  });

  it('adds VAT on top when prices exclude VAT', () => {
    const t = computeCheckoutTotals({ lines: [fixed({ unitPrice: 10000 })], lineDiscounts: {}, shipping: 2000, codFee: 0, settings: { ...settings, pricesIncludeVat: false } });
    expect(t.net).toBe(12000);
    expect(t.vat).toBe(1800);
    expect(t.total).toBe(13800);
    expect(t.shippingTotal).toBe(2300);
  });
});

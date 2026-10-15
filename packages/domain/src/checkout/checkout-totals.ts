import { priceCart, type CartLineInput, type CartPricingSettings, type PricedCart } from '../cart/cart-pricing';
import type { Halalas } from '../money/money';
import { computeLineVat, summarizeVat, type VatLineResult, type VatSummary } from '../tax/vat';

/**
 * Final order totals: goods (with promotion discounts per line), gift wrap, shipping and the
 * cash-on-delivery fee. Shipping and fees are taxable services at the standard rate, priced in the
 * same basis (VAT-inclusive or exclusive) as the goods.
 */
export interface CheckoutTotalsInput {
  lines: CartLineInput[];
  /** lineId → discount from promotions (halalas, display basis). */
  lineDiscounts: Record<string, Halalas>;
  shipping: Halalas;
  codFee: Halalas;
  settings: CartPricingSettings;
}

export interface CheckoutTotals {
  cart: PricedCart;
  shipping: VatLineResult;
  codFee: VatLineResult;
  subtotal: Halalas;
  discount: Halalas;
  giftWrap: Halalas;
  shippingTotal: Halalas;
  codFeeTotal: Halalas;
  vat: Halalas;
  net: Halalas;
  total: Halalas;
  vatBreakdown: VatSummary['byRate'];
}

export function computeCheckoutTotals(input: CheckoutTotalsInput): CheckoutTotals {
  const cart = priceCart(
    input.lines.map((l) => ({ ...l, discount: input.lineDiscounts[l.id] ?? 0 })),
    input.settings,
  );
  const service = (amount: Halalas) =>
    computeLineVat({ unitPrice: amount, quantity: 1, rateBp: input.settings.vatRateBp, pricesIncludeVat: input.settings.pricesIncludeVat });
  const shipping = service(input.shipping);
  const codFee = service(input.codFee);
  const all = summarizeVat([...cart.lines.map((l) => l.vat), shipping, codFee]);
  return {
    cart,
    shipping,
    codFee,
    subtotal: cart.subtotal,
    discount: cart.discount,
    giftWrap: cart.giftWrap,
    shippingTotal: shipping.gross,
    codFeeTotal: codFee.gross,
    vat: all.vat,
    net: all.net,
    total: all.gross,
    vatBreakdown: all.byRate,
  };
}

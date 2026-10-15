import { assertHalalas, type Halalas } from '../money/money';
import { priceLine, PricingError, type PricingMode, type PricingRules } from '../catalog/pricing';
import { computeLineVat, summarizeVat, type VatLineResult } from '../tax/vat';

/**
 * Cart pricing. Promotions (Phase 4) are applied as line discounts before VAT, so this stays the
 * single place where a cart total is computed (API, storefront preview and checkout).
 */
export interface CartLineInput {
  id: string;
  pricingMode: PricingMode;
  /** Halalas: per item / per metre / per m² depending on the mode. */
  unitPrice: Halalas;
  quantity: number;
  lengthCm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  isSample?: boolean;
  samplePrice?: Halalas | null;
  giftWrap?: boolean;
  discount?: Halalas;
}

export interface CartPricingSettings {
  vatRateBp: number;
  pricesIncludeVat: boolean;
  /** Gift wrapping fee per wrapped unit, or null when the module is disabled. */
  giftWrapPrice: Halalas | null;
  rules?: PricingRules;
}

export interface PricedCartLine {
  id: string;
  /** Price of one unit as charged (after measurement, before discount). */
  unitPrice: Halalas;
  quantity: number;
  /** Billed measure for measured products (cm for PER_METER, m² ×10000 for PER_SQM). */
  billedMeasure?: number;
  discount: Halalas;
  giftWrap: Halalas;
  /** Amount payable for the line including VAT and gift wrap. */
  total: Halalas;
  vat: VatLineResult;
}

export interface PricedCart {
  lines: PricedCartLine[];
  /** Goods before discounts, in the display basis (VAT-inclusive when prices include VAT). */
  subtotal: Halalas;
  discount: Halalas;
  giftWrap: Halalas;
  vat: Halalas;
  net: Halalas;
  total: Halalas;
  itemCount: number;
}

export class CartPricingError extends PricingError {
  constructor(
    readonly lineId: string,
    message: string,
  ) {
    super(message);
    this.name = 'CartPricingError';
  }
}

export function priceCartLineUnit(line: CartLineInput, rules?: PricingRules): { unitPrice: Halalas; billedMeasure?: number } {
  if (line.isSample) {
    if (line.samplePrice === null || line.samplePrice === undefined) throw new CartPricingError(line.id, 'Samples are not available for this product');
    return { unitPrice: assertHalalas(line.samplePrice, 'samplePrice') };
  }
  switch (line.pricingMode) {
    case 'FIXED':
      return { unitPrice: priceLine({ mode: 'FIXED', unitPrice: line.unitPrice, quantity: 1 }).unitPrice };
    case 'PER_METER': {
      if (!line.lengthCm) throw new CartPricingError(line.id, 'Length is required for products sold by the metre');
      const r = priceLine({ mode: 'PER_METER', pricePerMeter: line.unitPrice, lengthCm: line.lengthCm, quantity: 1, rules });
      return { unitPrice: r.unitPrice, billedMeasure: r.billedMeasure };
    }
    case 'PER_SQM': {
      if (!line.widthMm || !line.heightMm) throw new CartPricingError(line.id, 'Width and height are required for products sold by area');
      const r = priceLine({ mode: 'PER_SQM', pricePerSqm: line.unitPrice, widthMm: line.widthMm, heightMm: line.heightMm, quantity: 1, rules });
      return { unitPrice: r.unitPrice, billedMeasure: r.billedMeasure };
    }
    default:
      throw new CartPricingError(line.id, 'Made-to-measure products must be configured first');
  }
}

export function priceCart(lines: readonly CartLineInput[], settings: CartPricingSettings): PricedCart {
  const priced = lines.map((line): PricedCartLine => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new CartPricingError(line.id, 'Quantity must be at least 1');
    const { unitPrice, billedMeasure } = priceCartLineUnit(line, settings.rules);
    const discount = line.discount ?? 0;
    const wrap = line.giftWrap && !line.isSample && settings.giftWrapPrice !== null ? settings.giftWrapPrice * line.quantity : 0;
    if (discount < 0 || discount > unitPrice * line.quantity) throw new CartPricingError(line.id, 'Invalid discount');
    // Gift wrapping is a taxable service billed with the line, so VAT is computed on the sum.
    const vat = computeLineVat({
      unitPrice: unitPrice * line.quantity + wrap,
      quantity: 1,
      discount,
      rateBp: settings.vatRateBp,
      pricesIncludeVat: settings.pricesIncludeVat,
    });
    return { id: line.id, unitPrice, quantity: line.quantity, billedMeasure, discount, giftWrap: wrap, total: vat.gross, vat };
  });
  const summary = summarizeVat(priced.map((l) => l.vat));
  const subtotal = priced.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const discount = priced.reduce((s, l) => s + l.discount, 0);
  const giftWrap = priced.reduce((s, l) => s + l.giftWrap, 0);
  return {
    lines: priced,
    subtotal,
    discount,
    giftWrap,
    vat: summary.vat,
    net: summary.net,
    total: summary.gross,
    itemCount: priced.reduce((s, l) => s + l.quantity, 0),
  };
}

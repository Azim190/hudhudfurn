import { assertHalalas, roundHalfUp, type Halalas } from '../money/money';

export const PRICING_MODES = ['FIXED', 'PER_METER', 'PER_SQM', 'CALCULATED'] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

export interface PricingRules {
  /** Fabric sold by length is cut in steps of this many centimetres (default 10 cm). */
  meterStepCm?: number;
  /** Minimum length that can be ordered, in cm. */
  minLengthCm?: number;
  /** Minimum billable area for per-m² items (e.g. blinds), in m². */
  minAreaSqm?: number;
}

export type PriceInput =
  | { mode: 'FIXED'; unitPrice: Halalas; quantity: number }
  | { mode: 'PER_METER'; pricePerMeter: Halalas; lengthCm: number; quantity: number; rules?: PricingRules }
  | { mode: 'PER_SQM'; pricePerSqm: Halalas; widthMm: number; heightMm: number; quantity: number; rules?: PricingRules };

export interface PriceResult {
  unitPrice: Halalas;
  quantity: number;
  total: Halalas;
  /** What was billed per unit: cm for PER_METER, m² (×10000, integer) for PER_SQM. */
  billedMeasure?: number;
}

function assertQuantity(q: number) {
  if (!Number.isInteger(q) || q < 1 || q > 10_000) throw new PricingError(`Invalid quantity ${q}`);
}

/**
 * Line price for catalog price modes. CALCULATED (made-to-measure) prices come from the
 * configurator engine (Phase 5), never from here.
 */
export function priceLine(input: PriceInput): PriceResult {
  assertQuantity(input.quantity);
  switch (input.mode) {
    case 'FIXED': {
      assertHalalas(input.unitPrice, 'unitPrice');
      return { unitPrice: input.unitPrice, quantity: input.quantity, total: input.unitPrice * input.quantity };
    }
    case 'PER_METER': {
      assertHalalas(input.pricePerMeter, 'pricePerMeter');
      const step = input.rules?.meterStepCm ?? 10;
      const min = input.rules?.minLengthCm ?? 0;
      if (!(input.lengthCm > 0)) throw new PricingError('lengthCm must be positive');
      const billedCm = Math.max(min, Math.ceil(input.lengthCm / step) * step);
      const unitPrice = roundHalfUp((input.pricePerMeter * billedCm) / 100);
      return { unitPrice, quantity: input.quantity, total: unitPrice * input.quantity, billedMeasure: billedCm };
    }
    case 'PER_SQM': {
      assertHalalas(input.pricePerSqm, 'pricePerSqm');
      if (!(input.widthMm > 0) || !(input.heightMm > 0)) throw new PricingError('dimensions must be positive');
      const areaSqm = Math.max(input.rules?.minAreaSqm ?? 0, (input.widthMm * input.heightMm) / 1_000_000);
      const unitPrice = roundHalfUp(input.pricePerSqm * areaSqm);
      return {
        unitPrice,
        quantity: input.quantity,
        total: unitPrice * input.quantity,
        billedMeasure: Math.round(areaSqm * 10_000),
      };
    }
    default:
      throw new PricingError(`Unsupported pricing mode ${(input as { mode: string }).mode}`);
  }
}

/** Percentage saved versus the compare-at price, floored (never overstates a discount). */
export function discountPercent(price: Halalas, compareAt: Halalas | null | undefined): number {
  if (!compareAt || compareAt <= price || price < 0) return 0;
  return Math.floor(((compareAt - price) * 100) / compareAt);
}

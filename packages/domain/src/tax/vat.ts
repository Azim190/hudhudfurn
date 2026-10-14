import { assertHalalas, roundHalfUp, type Halalas } from '../money/money';

/** Saudi standard VAT rate in basis points. The live value always comes from settings. */
export const SA_STANDARD_VAT_BP = 1500;

export interface VatLineInput {
  /** Unit price as shown to the customer (inclusive or exclusive per `pricesIncludeVat`). */
  unitPrice: Halalas;
  quantity: number;
  /** Total discount for the line, in the same basis as `unitPrice`. */
  discount?: Halalas;
  rateBp: number;
  pricesIncludeVat: boolean;
}

export interface VatLineResult {
  /** Taxable amount excluding VAT, after discount. */
  net: Halalas;
  vat: Halalas;
  /** Amount payable including VAT. */
  gross: Halalas;
  rateBp: number;
}

export class VatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VatError';
  }
}

/**
 * Compute VAT for a single line. VAT is rounded per line (half-up to the halala) and the
 * document totals are the sums of the lines, matching ZATCA's line-level validation rules.
 */
export function computeLineVat(input: VatLineInput): VatLineResult {
  const { unitPrice, quantity, rateBp, pricesIncludeVat } = input;
  const discount = input.discount ?? 0;
  assertHalalas(unitPrice, 'unitPrice');
  assertHalalas(discount, 'discount');
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new VatError(`quantity must be a positive integer, got ${quantity}`);
  }
  if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > 10_000) {
    throw new VatError(`rateBp must be an integer between 0 and 10000, got ${rateBp}`);
  }
  if (unitPrice < 0 || discount < 0) throw new VatError('amounts must not be negative');
  const lineAmount = unitPrice * quantity - discount;
  if (lineAmount < 0) throw new VatError('discount exceeds line amount');

  if (pricesIncludeVat) {
    const net = roundHalfUp((lineAmount * 10_000) / (10_000 + rateBp));
    return { net, vat: lineAmount - net, gross: lineAmount, rateBp };
  }
  const vat = roundHalfUp((lineAmount * rateBp) / 10_000);
  return { net: lineAmount, vat, gross: lineAmount + vat, rateBp };
}

export interface VatSummary {
  net: Halalas;
  vat: Halalas;
  gross: Halalas;
  /** VAT breakdown per rate, needed on tax invoices (e.g. 15% standard and 0% zero-rated). */
  byRate: Array<{ rateBp: number; net: Halalas; vat: Halalas }>;
}

export function summarizeVat(lines: readonly VatLineResult[]): VatSummary {
  const byRate = new Map<number, { rateBp: number; net: number; vat: number }>();
  let net = 0;
  let vat = 0;
  for (const line of lines) {
    net += line.net;
    vat += line.vat;
    const bucket = byRate.get(line.rateBp) ?? { rateBp: line.rateBp, net: 0, vat: 0 };
    bucket.net += line.net;
    bucket.vat += line.vat;
    byRate.set(line.rateBp, bucket);
  }
  return {
    net,
    vat,
    gross: net + vat,
    byRate: [...byRate.values()].sort((a, b) => b.rateBp - a.rateBp),
  };
}

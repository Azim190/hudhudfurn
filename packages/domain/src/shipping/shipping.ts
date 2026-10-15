import type { Halalas } from '../money/money';

/**
 * Shipping options for an address. Zones list city codes; a zone with "*" covers the rest of the
 * kingdom. Rates are per carrier/method and weight band, with an optional free-shipping threshold.
 */
export interface ShippingRateInput {
  id: string;
  carrier: string;
  method: string;
  nameAr: string;
  nameEn: string;
  minWeightG: number;
  /** Inclusive upper bound; null for no limit. */
  maxWeightG: number | null;
  price: Halalas;
  /** Goods total (after discounts) from which this rate is free. */
  freeAbove: Halalas | null;
  etaMinDays: number;
  etaMaxDays: number;
}

export interface ShippingZoneInput {
  id: string;
  cityCodes: string[];
  rates: ShippingRateInput[];
}

export interface ShippingOption {
  rateId: string;
  zoneId: string;
  carrier: string;
  method: string;
  nameAr: string;
  nameEn: string;
  price: Halalas;
  /** Price before free-shipping rules, for "you saved" displays. */
  listPrice: Halalas;
  etaMinDays: number;
  etaMaxDays: number;
}

export function zoneForCity(zones: readonly ShippingZoneInput[], cityCode: string): ShippingZoneInput | undefined {
  return zones.find((z) => z.cityCodes.includes(cityCode)) ?? zones.find((z) => z.cityCodes.includes('*'));
}

export function shippingOptions(input: {
  zones: readonly ShippingZoneInput[];
  cityCode: string;
  weightG: number;
  goodsTotal: Halalas;
  /** A free-shipping promotion applies. */
  freeShipping: boolean;
  /** Extra days added to every option (made-to-measure production). */
  productionDays?: { min: number; max: number };
}): ShippingOption[] {
  const zone = zoneForCity(input.zones, input.cityCode);
  if (!zone) return [];
  const weight = Math.max(0, input.weightG);
  return zone.rates
    .filter((r) => weight >= r.minWeightG && (r.maxWeightG === null || weight <= r.maxWeightG))
    .map((r) => {
      const free = input.freeShipping || (r.freeAbove !== null && input.goodsTotal >= r.freeAbove);
      return {
        rateId: r.id,
        zoneId: zone.id,
        carrier: r.carrier,
        method: r.method,
        nameAr: r.nameAr,
        nameEn: r.nameEn,
        price: free ? 0 : r.price,
        listPrice: r.price,
        etaMinDays: r.etaMinDays + (input.productionDays?.min ?? 0),
        etaMaxDays: r.etaMaxDays + (input.productionDays?.max ?? 0),
      };
    })
    .sort((a, b) => a.price - b.price || a.etaMaxDays - b.etaMaxDays);
}

export interface CodRules {
  enabled: boolean;
  fee: Halalas;
  /** Orders above this total cannot be paid on delivery (cash-handling risk). */
  maxTotal: Halalas;
  /** Made-to-measure items are produced per order, so they must be prepaid. */
  allowMadeToMeasure: boolean;
}

export type CodRejection = 'disabled' | 'city' | 'madeToMeasure' | 'amount' | 'pickup';

export function codEligibility(rules: CodRules, input: { cityCodAllowed: boolean; hasMadeToMeasure: boolean; total: Halalas; isPickup: boolean }): { allowed: true; fee: Halalas } | { allowed: false; reason: CodRejection } {
  if (!rules.enabled) return { allowed: false, reason: 'disabled' };
  if (input.isPickup) return { allowed: false, reason: 'pickup' };
  if (!input.cityCodAllowed) return { allowed: false, reason: 'city' };
  if (input.hasMadeToMeasure && !rules.allowMadeToMeasure) return { allowed: false, reason: 'madeToMeasure' };
  if (input.total + rules.fee > rules.maxTotal) return { allowed: false, reason: 'amount' };
  return { allowed: true, fee: rules.fee };
}

import { allocate, assertHalalas, roundHalfUp, type Halalas } from '../money/money';

/**
 * Promotions engine. Usage limits, dates and customer eligibility are checked by the caller (they
 * need the database); this module decides which promotions apply to a cart and how much each line
 * is discounted, without losing or creating a single halala.
 */
export const PROMOTION_TYPES = ['PERCENT', 'FIXED', 'FREE_SHIPPING', 'BXGY', 'BUNDLE'] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export interface PromotionConditions {
  /** Minimum amount of eligible goods (VAT-inclusive display basis), in halalas. */
  minSubtotal?: Halalas;
  productIds?: string[];
  /** Matches a line if any of its category ids (category plus ancestors) is listed. */
  categoryIds?: string[];
  verticals?: string[];
  firstOrderOnly?: boolean;
}

export interface PromotionBenefit {
  /** PERCENT: 1–100. */
  percent?: number;
  /** PERCENT: optional cap on the discount. */
  maxDiscount?: Halalas;
  /** FIXED: amount off the eligible goods. */
  amount?: Halalas;
  /** BXGY: buy `buyQuantity` eligible units, get `getQuantity` of the cheapest at `getPercent` off (default 100). */
  buyQuantity?: number;
  getQuantity?: number;
  getPercent?: number;
  /** BUNDLE: every `bundleQuantity` eligible units cost `bundlePrice` in total (e.g. a 3+2+1 cover set). */
  bundleQuantity?: number;
  bundlePrice?: Halalas;
}

export interface PromotionRule {
  id: string;
  /** Present when the rule is redeemed with a coupon code. */
  code?: string;
  type: PromotionType;
  automatic: boolean;
  priority: number;
  stackable: boolean;
  conditions: PromotionConditions;
  benefit: PromotionBenefit;
}

export interface PromotionLine {
  id: string;
  productId: string;
  categoryIds: string[];
  vertical: string;
  unitPrice: Halalas;
  quantity: number;
  /** Samples and similar lines never receive discounts. */
  excluded?: boolean;
}

export interface PromotionContext {
  isFirstOrder: boolean;
}

export interface AppliedPromotion {
  promotionId: string;
  code?: string;
  type: PromotionType;
  discount: Halalas;
  freeShipping: boolean;
  lineDiscounts: Record<string, Halalas>;
}

export type CouponRejection = 'minSubtotal' | 'notEligible' | 'notCombinable' | 'firstOrderOnly';

export interface PromotionResult {
  applied: AppliedPromotion[];
  lineDiscounts: Record<string, Halalas>;
  discount: Halalas;
  freeShipping: boolean;
  couponRejected?: CouponRejection;
}

export class PromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromotionError';
  }
}

export function validatePromotion(rule: PromotionRule): void {
  const b = rule.benefit;
  const positiveInt = (n: number | undefined) => n !== undefined && Number.isInteger(n) && n > 0;
  switch (rule.type) {
    case 'PERCENT':
      if (!b.percent || b.percent <= 0 || b.percent > 100) throw new PromotionError('percent must be between 1 and 100');
      if (b.maxDiscount !== undefined) assertHalalas(b.maxDiscount, 'maxDiscount');
      break;
    case 'FIXED':
      if (!positiveInt(b.amount)) throw new PromotionError('amount must be a positive number of halalas');
      break;
    case 'BXGY':
      if (!positiveInt(b.buyQuantity) || !positiveInt(b.getQuantity)) throw new PromotionError('buyQuantity and getQuantity are required');
      if (b.getPercent !== undefined && (b.getPercent <= 0 || b.getPercent > 100)) throw new PromotionError('getPercent must be between 1 and 100');
      break;
    case 'BUNDLE':
      if (!positiveInt(b.bundleQuantity) || b.bundleQuantity! < 2) throw new PromotionError('bundleQuantity must be at least 2');
      if (b.bundlePrice === undefined || !Number.isInteger(b.bundlePrice) || b.bundlePrice < 0) throw new PromotionError('bundlePrice is required');
      break;
    case 'FREE_SHIPPING':
      break;
  }
}

function matches(rule: PromotionRule, line: PromotionLine): boolean {
  if (line.excluded) return false;
  const c = rule.conditions;
  const scoped = Boolean(c.productIds?.length || c.categoryIds?.length || c.verticals?.length);
  if (!scoped) return true;
  return Boolean(
    c.productIds?.includes(line.productId) || c.categoryIds?.some((id) => line.categoryIds.includes(id)) || c.verticals?.includes(line.vertical),
  );
}

/** One unit per element, priced at what is still left after earlier promotions. */
function units(lines: PromotionLine[], remaining: Map<string, Halalas>) {
  const out: Array<{ lineId: string; price: number }> = [];
  for (const l of lines) {
    const perUnit = Math.floor((remaining.get(l.id) ?? 0) / l.quantity);
    for (let i = 0; i < l.quantity; i++) out.push({ lineId: l.id, price: perUnit });
  }
  return out.sort((a, b) => b.price - a.price || a.lineId.localeCompare(b.lineId));
}

/** Evaluate one rule against what is left of each line. Returns null when it does not apply. */
function evaluate(rule: PromotionRule, lines: PromotionLine[], remaining: Map<string, Halalas>, ctx: PromotionContext): AppliedPromotion | CouponRejection {
  if (rule.conditions.firstOrderOnly && !ctx.isFirstOrder) return 'firstOrderOnly';
  const eligible = lines.filter((l) => matches(rule, l) && (remaining.get(l.id) ?? 0) > 0);
  if (eligible.length === 0) return 'notEligible';
  const eligibleTotal = eligible.reduce((s, l) => s + (remaining.get(l.id) ?? 0), 0);
  if (rule.conditions.minSubtotal !== undefined && eligibleTotal < rule.conditions.minSubtotal) return 'minSubtotal';

  const base = { promotionId: rule.id, code: rule.code, type: rule.type };
  const spread = (amount: Halalas): Record<string, Halalas> => {
    const parts = allocate(amount, eligible.map((l) => remaining.get(l.id) ?? 0));
    return Object.fromEntries(eligible.map((l, i) => [l.id, parts[i]!]));
  };

  switch (rule.type) {
    case 'FREE_SHIPPING':
      return { ...base, discount: 0, freeShipping: true, lineDiscounts: {} };
    case 'PERCENT': {
      let discount = roundHalfUp((eligibleTotal * rule.benefit.percent!) / 100);
      if (rule.benefit.maxDiscount !== undefined) discount = Math.min(discount, rule.benefit.maxDiscount);
      return { ...base, discount, freeShipping: false, lineDiscounts: spread(discount) };
    }
    case 'FIXED': {
      const discount = Math.min(rule.benefit.amount!, eligibleTotal);
      return { ...base, discount, freeShipping: false, lineDiscounts: spread(discount) };
    }
    case 'BXGY': {
      const { buyQuantity, getQuantity } = rule.benefit;
      const pct = rule.benefit.getPercent ?? 100;
      const sorted = units(eligible, remaining);
      const group = buyQuantity! + getQuantity!;
      const lineDiscounts: Record<string, Halalas> = {};
      for (let start = 0; start + group <= sorted.length; start += group) {
        // The cheapest units of each group are the free/discounted ones.
        for (const u of sorted.slice(start + buyQuantity!, start + group)) {
          lineDiscounts[u.lineId] = (lineDiscounts[u.lineId] ?? 0) + roundHalfUp((u.price * pct) / 100);
        }
      }
      const discount = Object.values(lineDiscounts).reduce((a, b) => a + b, 0);
      return discount > 0 ? { ...base, discount, freeShipping: false, lineDiscounts } : 'notEligible';
    }
    case 'BUNDLE': {
      const { bundleQuantity, bundlePrice } = rule.benefit;
      const sorted = units(eligible, remaining);
      const lineDiscounts: Record<string, Halalas> = {};
      for (let start = 0; start + bundleQuantity! <= sorted.length; start += bundleQuantity!) {
        const set = sorted.slice(start, start + bundleQuantity!);
        const value = set.reduce((s, u) => s + u.price, 0);
        const saving = value - bundlePrice!;
        if (saving <= 0) continue;
        const parts = allocate(saving, set.map((u) => u.price));
        set.forEach((u, i) => (lineDiscounts[u.lineId] = (lineDiscounts[u.lineId] ?? 0) + parts[i]!));
      }
      const discount = Object.values(lineDiscounts).reduce((a, b) => a + b, 0);
      return discount > 0 ? { ...base, discount, freeShipping: false, lineDiscounts } : 'notEligible';
    }
  }
}

/**
 * Apply promotions in order: the customer's coupon first (explicit intent), then automatic
 * promotions by priority. A non-stackable promotion only applies when nothing else has, and blocks
 * everything after it. Free-shipping promotions never conflict with discounts.
 */
export function applyPromotions(lines: PromotionLine[], rules: PromotionRule[], ctx: PromotionContext): PromotionResult {
  rules.forEach(validatePromotion);
  const remaining = new Map(lines.map((l) => [l.id, l.unitPrice * l.quantity]));
  const ordered = [...rules].sort((a, b) => Number(Boolean(b.code)) - Number(Boolean(a.code)) || b.priority - a.priority || a.id.localeCompare(b.id));

  const applied: AppliedPromotion[] = [];
  let locked = false;
  let couponRejected: CouponRejection | undefined;

  for (const rule of ordered) {
    const shippingOnly = rule.type === 'FREE_SHIPPING';
    const discounts = applied.filter((a) => a.type !== 'FREE_SHIPPING');
    if (!shippingOnly && (locked || (!rule.stackable && discounts.length > 0))) {
      if (rule.code) couponRejected = 'notCombinable';
      continue;
    }
    const outcome = evaluate(rule, lines, remaining, ctx);
    if (typeof outcome === 'string') {
      if (rule.code) couponRejected = outcome;
      continue;
    }
    for (const [lineId, d] of Object.entries(outcome.lineDiscounts)) remaining.set(lineId, (remaining.get(lineId) ?? 0) - d);
    applied.push(outcome);
    if (!rule.stackable && !shippingOnly) locked = true;
  }

  const lineDiscounts: Record<string, Halalas> = {};
  for (const a of applied) for (const [id, d] of Object.entries(a.lineDiscounts)) lineDiscounts[id] = (lineDiscounts[id] ?? 0) + d;
  return {
    applied,
    lineDiscounts,
    discount: applied.reduce((s, a) => s + a.discount, 0),
    freeShipping: applied.some((a) => a.freeShipping),
    ...(couponRejected ? { couponRejected } : {}),
  };
}

import { Injectable } from '@nestjs/common';
import {
  applyPromotions,
  PromotionError,
  validatePromotion,
  type AppliedPromotion,
  type CouponRejection,
  type PromotionLine,
  type PromotionResult,
  type PromotionRule,
} from '@hudhud/domain';
import { Prisma, type Promotion } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { CouponDto, PromotionDto, PromotionListQueryDto, UpdatePromotionDto } from './promotions.dto';

export type CouponProblem = CouponRejection | 'unknown' | 'expired' | 'usageLimit';

export interface PromotionEvaluation {
  result: PromotionResult;
  /** Present when a coupon was entered and is valid (it may still not apply, see couponProblem). */
  coupon?: { id: string; code: string; promotionId: string };
  couponProblem?: CouponProblem;
  names: Map<string, { nameAr: string; nameEn: string }>;
}

export interface Shopper {
  userId?: string;
  phoneE164?: string;
}

const now = () => new Date();
const liveWindow = () => ({
  isActive: true,
  AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now() } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now() } }] }],
});

function toRule(p: Promotion, code?: string): PromotionRule {
  return {
    id: p.id,
    code,
    type: p.type,
    automatic: p.automatic,
    priority: p.priority,
    stackable: p.stackable,
    conditions: (p.conditions ?? {}) as PromotionRule['conditions'],
    benefit: (p.benefit ?? {}) as PromotionRule['benefit'],
  };
}

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Category ids of each category plus all its ancestors, for category-scoped promotions. */
  async categoryLineage(): Promise<(categoryId: string) => string[]> {
    const rows = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    const parent = new Map(rows.map((r) => [r.id, r.parentId]));
    return (id: string) => {
      const out: string[] = [];
      for (let cur: string | null | undefined = id; cur && out.length < 20; cur = parent.get(cur)) out.push(cur);
      return out;
    };
  }

  async evaluate(lines: PromotionLine[], couponCode: string | undefined, shopper: Shopper): Promise<PromotionEvaluation> {
    const automatic = await this.prisma.promotion.findMany({ where: { ...liveWindow(), automatic: true } });
    const rules = automatic.filter((p) => p.usageLimit === null || p.usageCount < p.usageLimit).map((p) => toRule(p));
    const names = new Map([...automatic].map((p) => [p.id, { nameAr: p.nameAr, nameEn: p.nameEn }]));

    let coupon: PromotionEvaluation['coupon'];
    let couponProblem: CouponProblem | undefined;
    if (couponCode) {
      const found = await this.prisma.coupon.findUnique({ where: { code: couponCode.trim().toUpperCase() }, include: { promotion: true } });
      const p = found?.promotion;
      if (!found || !found.isActive || !p || !p.isActive) couponProblem = 'unknown';
      else if ((p.startsAt && p.startsAt > now()) || (p.endsAt && p.endsAt <= now())) couponProblem = 'expired';
      else if ((found.usageLimit !== null && found.usageCount >= found.usageLimit) || (p.usageLimit !== null && p.usageCount >= p.usageLimit)) couponProblem = 'usageLimit';
      else if (p.perCustomerLimit !== null && (await this.customerUses(this.prisma, p.id, shopper)) >= p.perCustomerLimit) couponProblem = 'usageLimit';
      else {
        coupon = { id: found.id, code: found.code, promotionId: p.id };
        // A coupon for an automatic promotion only makes sense once; drop the automatic copy.
        const i = rules.findIndex((r) => r.id === p.id);
        if (i >= 0) rules.splice(i, 1);
        rules.push(toRule(p, found.code));
        names.set(p.id, { nameAr: p.nameAr, nameEn: p.nameEn });
      }
    }

    const isFirstOrder = await this.isFirstOrder(shopper);
    const result = applyPromotions(lines, rules, { isFirstOrder });
    if (coupon && result.couponRejected) couponProblem = result.couponRejected;
    return { result, coupon, couponProblem, names };
  }

  /**
   * Record the promotions an order used, inside the order transaction. Usage counters are bumped
   * with conditional updates so concurrent orders can never exceed a limit.
   */
  async redeem(tx: Prisma.TransactionClient, orderId: string, applied: AppliedPromotion[], coupon: PromotionEvaluation['coupon'], shopper: Required<Pick<Shopper, 'phoneE164'>> & Shopper) {
    for (const a of applied) {
      const promo = await tx.promotion.findUniqueOrThrow({ where: { id: a.promotionId } });
      const bumped = await tx.$executeRaw`
        UPDATE promotions SET usage_count = usage_count + 1
        WHERE id = ${a.promotionId}::uuid AND (usage_limit IS NULL OR usage_count < usage_limit)`;
      if (bumped === 0) throw AppError.badRequest('couponNotApplicable', { reason: 'usageLimit' });
      if (promo.perCustomerLimit !== null && (await this.customerUses(tx, promo.id, shopper)) >= promo.perCustomerLimit) {
        throw AppError.badRequest('couponNotApplicable', { reason: 'usageLimit' });
      }
      const couponId = a.code && coupon?.promotionId === a.promotionId ? coupon.id : undefined;
      if (couponId) {
        const used = await tx.$executeRaw`
          UPDATE coupons SET usage_count = usage_count + 1
          WHERE id = ${couponId}::uuid AND (usage_limit IS NULL OR usage_count < usage_limit)`;
        if (used === 0) throw AppError.badRequest('couponNotApplicable', { reason: 'usageLimit' });
      }
      await tx.promotionRedemption.create({
        data: { promotionId: a.promotionId, couponId, orderId, userId: shopper.userId, phoneE164: shopper.phoneE164, discount: a.discount },
      });
    }
  }

  /** Give the uses back when an unpaid order expires or an order is cancelled before payment. */
  async release(tx: Prisma.TransactionClient, orderId: string) {
    const rows = await tx.promotionRedemption.findMany({ where: { orderId, released: false } });
    for (const r of rows) {
      await tx.$executeRaw`UPDATE promotions SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = ${r.promotionId}::uuid`;
      if (r.couponId) await tx.$executeRaw`UPDATE coupons SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = ${r.couponId}::uuid`;
    }
    await tx.promotionRedemption.updateMany({ where: { orderId, released: false }, data: { released: true } });
  }

  private customerUses(db: Prisma.TransactionClient | PrismaService, promotionId: string, shopper: Shopper) {
    const who = [shopper.userId ? { userId: shopper.userId } : null, shopper.phoneE164 ? { phoneE164: shopper.phoneE164 } : null].filter(Boolean) as Prisma.PromotionRedemptionWhereInput[];
    if (who.length === 0) return Promise.resolve(0);
    return db.promotionRedemption.count({ where: { promotionId, released: false, OR: who } });
  }

  private async isFirstOrder(shopper: Shopper): Promise<boolean> {
    const who = [shopper.userId ? { userId: shopper.userId } : null, shopper.phoneE164 ? { contactPhoneE164: shopper.phoneE164 } : null].filter(Boolean) as Prisma.OrderWhereInput[];
    if (who.length === 0) return true;
    const count = await this.prisma.order.count({ where: { OR: who, status: { not: 'CANCELLED' } } });
    return count === 0;
  }

  // ───── Admin ─────

  async list(q: PromotionListQueryDto) {
    const where: Prisma.PromotionWhereInput = {
      ...(q.q ? { OR: [{ nameAr: { contains: q.q, mode: 'insensitive' } }, { nameEn: { contains: q.q, mode: 'insensitive' } }, { coupons: { some: { code: { contains: q.q.toUpperCase() } } } }] } : {}),
      ...(q.active !== undefined ? { isActive: q.active } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.promotion.findMany({ where, include: { coupons: { orderBy: { createdAt: 'asc' } } }, orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.promotion.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }

  async get(id: string) {
    const p = await this.prisma.promotion.findUnique({ where: { id }, include: { coupons: { orderBy: { createdAt: 'asc' } }, _count: { select: { redemptions: { where: { released: false } } } } } });
    if (!p) throw AppError.notFound({ entity: 'promotion' });
    return p;
  }

  async create(dto: PromotionDto) {
    const data = this.validated(dto);
    try {
      return await this.prisma.promotion.create({
        data: { ...data, coupons: dto.couponCodes?.length ? { create: dto.couponCodes.map((code) => ({ code: code.toUpperCase() })) } : undefined },
        include: { coupons: true },
      });
    } catch (err) {
      throw this.duplicateCode(err);
    }
  }

  async update(id: string, dto: UpdatePromotionDto) {
    const existing = await this.get(id);
    const data = this.validated({
      nameAr: existing.nameAr,
      nameEn: existing.nameEn,
      type: existing.type,
      automatic: existing.automatic,
      priority: existing.priority,
      stackable: existing.stackable,
      conditions: existing.conditions as PromotionDto['conditions'],
      benefit: existing.benefit as PromotionDto['benefit'],
      startsAt: existing.startsAt?.toISOString(),
      endsAt: existing.endsAt?.toISOString(),
      usageLimit: existing.usageLimit ?? undefined,
      perCustomerLimit: existing.perCustomerLimit ?? undefined,
      isActive: existing.isActive,
      ...dto,
    });
    return this.prisma.promotion.update({ where: { id }, data, include: { coupons: true } });
  }

  async addCoupon(promotionId: string, dto: CouponDto) {
    await this.get(promotionId);
    try {
      return await this.prisma.coupon.create({ data: { promotionId, code: dto.code.toUpperCase(), usageLimit: dto.usageLimit } });
    } catch (err) {
      throw this.duplicateCode(err);
    }
  }

  async setCouponActive(id: string, isActive: boolean) {
    const c = await this.prisma.coupon.findUnique({ where: { id } });
    if (!c) throw AppError.notFound({ entity: 'coupon' });
    return this.prisma.coupon.update({ where: { id }, data: { isActive } });
  }

  private validated(dto: PromotionDto) {
    const rule: PromotionRule = {
      id: 'new',
      type: dto.type,
      automatic: dto.automatic ?? false,
      priority: dto.priority ?? 0,
      stackable: dto.stackable ?? true,
      conditions: { ...dto.conditions },
      benefit: { ...dto.benefit },
    };
    try {
      validatePromotion(rule);
    } catch (err) {
      if (err instanceof PromotionError) throw AppError.badRequest('validation', { field: 'benefit', reason: err.message });
      throw err;
    }
    if (dto.startsAt && dto.endsAt && new Date(dto.endsAt) <= new Date(dto.startsAt)) throw AppError.badRequest('validation', { field: 'endsAt' });
    return {
      nameAr: dto.nameAr,
      nameEn: dto.nameEn,
      type: dto.type,
      automatic: rule.automatic,
      priority: rule.priority,
      stackable: rule.stackable,
      conditions: rule.conditions as Prisma.InputJsonValue,
      benefit: rule.benefit as Prisma.InputJsonValue,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      usageLimit: dto.usageLimit ?? null,
      perCustomerLimit: dto.perCustomerLimit ?? null,
      isActive: dto.isActive ?? true,
    };
  }

  private duplicateCode(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return AppError.conflict('conflict', { field: 'code' });
    return err;
  }
}

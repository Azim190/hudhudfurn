import { Injectable } from '@nestjs/common';
import type { Locale } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { availableQuantity, CatalogPresenter, PRODUCT_FULL_INCLUDE } from '../catalog/catalog.presenter';
import { MediaService } from '../media/media.service';
import { SettingsService } from '../settings/settings.service';
import { ShippingService } from '../shipping/shipping.service';

const LIVE = { status: 'ACTIVE' as const, deletedAt: null };
const MAX_WISHLIST = 200;

/** Customer-facing extras around the catalog: wishlist, stock alerts, cards, delivery ETA, reviews. */
@Injectable()
export class ShopService {
  private readonly presenter: CatalogPresenter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly shipping: ShippingService,
    media: MediaService,
  ) {
    this.presenter = new CatalogPresenter(media);
  }

  /** Cards for an explicit id list (compare, recently viewed, guest wishlist), in the requested order. */
  async cards(ids: string[]) {
    const unique = [...new Set(ids)].slice(0, 24);
    const rows = await this.prisma.product.findMany({ where: { id: { in: unique }, ...LIVE }, include: PRODUCT_FULL_INCLUDE });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return unique.flatMap((id) => {
      const p = byId.get(id);
      if (!p) return [];
      const card = this.presenter.card(p);
      // Compare view needs the product attributes too.
      const attributes = p.attributes.map((a) => ({ key: a.value.attribute.key, nameAr: a.value.attribute.nameAr, nameEn: a.value.attribute.nameEn, labelAr: a.value.labelAr, labelEn: a.value.labelEn }));
      return [{ ...card, attributes }];
    });
  }

  async wishlist(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId, product: LIVE },
      orderBy: { createdAt: 'desc' },
      include: { product: { include: PRODUCT_FULL_INCLUDE } },
    });
    return items.map((i) => ({ ...this.presenter.card(i.product), addedAt: i.createdAt }));
  }

  async wishlistIds(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({ where: { userId }, select: { productId: true } });
    return items.map((i) => i.productId);
  }

  async addToWishlist(userId: string, productIds: string[]) {
    const ids = [...new Set(productIds)];
    const live = await this.prisma.product.findMany({ where: { id: { in: ids }, ...LIVE }, select: { id: true } });
    if (live.length === 0) throw AppError.badRequest('productUnavailable');
    const count = await this.prisma.wishlistItem.count({ where: { userId } });
    if (count + live.length > MAX_WISHLIST) throw AppError.badRequest('cartLimit');
    await this.prisma.wishlistItem.createMany({ data: live.map((p) => ({ userId, productId: p.id })), skipDuplicates: true });
    return this.wishlistIds(userId);
  }

  async removeFromWishlist(userId: string, productId: string) {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, productId } });
    return this.wishlistIds(userId);
  }

  async notifyWhenAvailable(userId: string, variantId: string, locale: Locale) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true, stock: { include: { location: { select: { isActive: true } } } } },
    });
    if (!variant || !variant.isActive || variant.product.status !== 'ACTIVE') throw AppError.badRequest('productUnavailable');
    if (variant.product.isMadeToMeasure || availableQuantity(variant) > 0) throw AppError.conflict('alreadyInStock');
    await this.prisma.backInStockSubscription.upsert({
      where: { variantId_userId: { variantId, userId } },
      create: { variantId, userId, locale },
      update: { notifiedAt: null, locale },
    });
    return { subscribed: true };
  }

  /**
   * Delivery estimate by city: the fastest rate of the city's shipping zone, plus production time
   * for made-to-measure products. Falls back to settings `shipping.eta` when no zone covers it.
   */
  async deliveryEstimate(cityCode: string, productId?: string) {
    const city = await this.prisma.city.findFirst({ where: { OR: [{ code: cityCode }, { id: /^[0-9a-f-]{36}$/.test(cityCode) ? cityCode : undefined }], isActive: true } });
    if (!city) throw AppError.notFound({ entity: 'city' });
    const eta = await this.settings.get('shipping.eta');
    let production = { min: 0, max: 0 };
    if (productId) {
      const p = await this.prisma.product.findFirst({ where: { id: productId, ...LIVE }, select: { isMadeToMeasure: true } });
      if (p?.isMadeToMeasure) production = { min: eta.productionMin, max: eta.productionMax };
    }
    const zoned = await this.shipping.estimate(city.code, false);
    const [min, max] = zoned
      ? [zoned.minDays, zoned.maxDays]
      : city.code === 'RUH'
        ? [eta.riyadhMin, eta.riyadhMax]
        : ['JED', 'DMM', 'KHB', 'MKK', 'MED', 'DHA'].includes(city.code)
          ? [eta.mainMin, eta.mainMax]
          : [eta.otherMin, eta.otherMax];
    const from = addBusinessDays(new Date(), min + production.min);
    const to = addBusinessDays(new Date(), max + production.max);
    return {
      city: { code: city.code, nameAr: city.nameAr, nameEn: city.nameEn, codAllowed: city.codAllowed },
      minDays: min + production.min,
      maxDays: max + production.max,
      productionDays: production.max ? production : null,
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  async reviews(productId: string, page: number, limit: number) {
    const where = { productId, status: 'APPROVED' as const };
    const [items, total, histogram, product] = await Promise.all([
      this.prisma.review.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, select: { id: true, rating: true, title: true, body: true, locale: true, authorName: true, createdAt: true } }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({ by: ['rating'], where, _count: { _all: true } }),
      this.prisma.product.findUnique({ where: { id: productId }, select: { ratingAvg: true, ratingCount: true } }),
    ]);
    if (!product) throw AppError.notFound({ entity: 'product' });
    return {
      items,
      total,
      page,
      limit,
      ratingAvg: Number(product.ratingAvg),
      ratingCount: product.ratingCount,
      histogram: Object.fromEntries([5, 4, 3, 2, 1].map((r) => [r, histogram.find((h) => h.rating === r)?._count._all ?? 0])),
    };
  }
}

/** Saudi weekend is Friday–Saturday. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 5 && dow !== 6) added++;
  }
  return d;
}

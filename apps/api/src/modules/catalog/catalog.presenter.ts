import { discountPercent } from '@hudhud/domain';
import type { Prisma } from '@prisma/client';
import type { MediaService } from '../media/media.service';

/** Everything needed to render a product card, a search document or a product page. */
export const PRODUCT_FULL_INCLUDE = {
  category: { select: { id: true, parentId: true, vertical: true, nameAr: true, nameEn: true, slugAr: true, slugEn: true } },
  brand: { select: { id: true, nameAr: true, nameEn: true, slug: true } },
  sizeGuide: true,
  configuratorTemplate: { select: { id: true, code: true, kind: true, isActive: true } },
  attributes: { include: { value: { include: { attribute: true } } } },
  variants: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      options: { include: { value: { include: { attribute: true } } } },
      stock: { include: { location: { select: { isActive: true } } } },
    },
  },
  media: { orderBy: { sortOrder: 'asc' }, include: { media: true } },
} satisfies Prisma.ProductInclude;

export type ProductFull = Prisma.ProductGetPayload<{ include: typeof PRODUCT_FULL_INCLUDE }>;
type VariantFull = ProductFull['variants'][number];

export function availableQuantity(variant: Pick<VariantFull, 'stock'>): number {
  return variant.stock
    .filter((s) => s.location.isActive)
    .reduce((sum, s) => sum + Math.max(0, s.onHand - s.reserved), 0);
}

export function effectivePrice(product: Pick<ProductFull, 'basePrice' | 'compareAtPrice'>, variant?: Pick<VariantFull, 'price' | 'compareAtPrice'>) {
  const price = variant?.price ?? product.basePrice;
  const compareAt = variant?.compareAtPrice ?? (variant?.price == null ? product.compareAtPrice : null);
  return { price, compareAtPrice: compareAt && compareAt > price ? compareAt : null, discountPercent: discountPercent(price, compareAt) };
}

export function isPurchasable(product: Pick<ProductFull, 'isMadeToMeasure'>, variant: VariantFull): boolean {
  // Made-to-measure items are produced per order, so stock does not limit them.
  return variant.isActive && (product.isMadeToMeasure || availableQuantity(variant) > 0);
}

const optionView = (o: VariantFull['options'][number]) => ({
  attributeKey: o.value.attribute.key,
  code: o.value.code,
  labelAr: o.value.labelAr,
  labelEn: o.value.labelEn,
  swatchHex: o.value.swatchHex,
});

export class CatalogPresenter {
  constructor(private readonly media: MediaService) {}

  /** Compact shape for listings, search results and cross-sells. */
  card(p: ProductFull) {
    const active = p.variants.filter((v) => v.isActive);
    const priced = (active.length ? active : [undefined]).map((v) => ({ v, ...effectivePrice(p, v) }));
    const cheapest = priced.reduce((min, cur) => (cur.price < min.price ? cur : min), priced[0]!);
    const colors = new Map<string, ReturnType<typeof optionView>>();
    for (const v of active) for (const o of v.options) if (o.value.attribute.type === 'COLOR') colors.set(o.value.code, optionView(o));
    const cover = p.media[0]?.media;

    return {
      id: p.id,
      slugAr: p.slugAr,
      slugEn: p.slugEn,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      vertical: p.category.vertical,
      categoryId: p.categoryId,
      pricingMode: p.pricingMode,
      isMadeToMeasure: p.isMadeToMeasure,
      price: cheapest.price,
      compareAtPrice: cheapest.compareAtPrice,
      discountPercent: cheapest.discountPercent,
      /** True when variants differ in price, so the storefront shows "from". */
      priceFrom: new Set(priced.map((x) => x.price)).size > 1 || p.pricingMode !== 'FIXED',
      inStock: active.some((v) => isPurchasable(p, v)),
      ratingAvg: Number(p.ratingAvg),
      ratingCount: p.ratingCount,
      image: cover ? this.media.toDto(cover) : null,
      swatches: [...colors.values()],
    };
  }

  /** Full product page payload. Exact stock counts stay internal; only availability is exposed. */
  detail(p: ProductFull) {
    const card = this.card(p);
    const attrGroups = new Map<string, { key: string; nameAr: string; nameEn: string | null; type: string; values: Array<{ code: string; labelAr: string; labelEn: string | null }> }>();
    for (const pav of p.attributes) {
      const a = pav.value.attribute;
      const group = attrGroups.get(a.key) ?? { key: a.key, nameAr: a.nameAr, nameEn: a.nameEn, type: a.type, values: [] };
      group.values.push({ code: pav.value.code, labelAr: pav.value.labelAr, labelEn: pav.value.labelEn });
      attrGroups.set(a.key, group);
    }

    const axes = new Map<string, { key: string; nameAr: string; nameEn: string | null; type: string; sortOrder: number; values: Map<string, ReturnType<typeof optionView> & { sortOrder: number }> }>();
    const variants = p.variants
      .filter((v) => v.isActive)
      .map((v) => {
        for (const o of v.options) {
          const a = o.value.attribute;
          const axis = axes.get(a.key) ?? { key: a.key, nameAr: a.nameAr, nameEn: a.nameEn, type: a.type, sortOrder: a.sortOrder, values: new Map() };
          axis.values.set(o.value.code, { ...optionView(o), sortOrder: o.value.sortOrder });
          axes.set(a.key, axis);
        }
        const available = availableQuantity(v);
        return {
          id: v.id,
          sku: v.sku,
          ...effectivePrice(p, v),
          options: Object.fromEntries(v.options.map((o) => [o.value.attribute.key, o.value.code])),
          available: isPurchasable(p, v),
          lowStock: !p.isMadeToMeasure && available > 0 && available <= Math.min(...v.stock.map((s) => s.lowStockThreshold), 5),
          isDefault: v.isDefault,
          imageIds: p.media.filter((m) => m.variantId === v.id).map((m) => m.mediaId),
        };
      });

    return {
      ...card,
      descriptionAr: p.descriptionAr,
      descriptionEn: p.descriptionEn,
      careAr: p.careAr,
      careEn: p.careEn,
      seo: { titleAr: p.seoTitleAr, titleEn: p.seoTitleEn, descriptionAr: p.seoDescriptionAr, descriptionEn: p.seoDescriptionEn },
      category: p.category,
      brand: p.brand,
      basePrice: p.basePrice,
      vatInclusive: p.vatInclusive,
      sampleAvailable: p.sampleAvailable,
      samplePrice: p.samplePrice,
      configurator: p.configuratorTemplate?.isActive ? { kind: p.configuratorTemplate.kind, code: p.configuratorTemplate.code } : null,
      photoStyle: p.photoStyle,
      sizeGuide: p.sizeGuide
        ? { titleAr: p.sizeGuide.titleAr, titleEn: p.sizeGuide.titleEn, table: p.sizeGuide.table, howToMeasureAr: p.sizeGuide.howToMeasureAr, howToMeasureEn: p.sizeGuide.howToMeasureEn }
        : null,
      attributes: [...attrGroups.values()],
      // Axes and their values follow the configured attribute order (e.g. colour before size).
      axes: [...axes.values()]
        .sort((x, y) => x.sortOrder - y.sortOrder)
        .map(({ sortOrder: _s, values, ...a }) => ({ ...a, values: [...values.values()].sort((x, y) => x.sortOrder - y.sortOrder).map(({ sortOrder: _v, ...v }) => v) })),
      variants,
      media: p.media.map((m) => ({ ...this.media.toDto(m.media), variantId: m.variantId })),
      publishedAt: p.publishedAt,
    };
  }
}

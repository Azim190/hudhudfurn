import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { SearchService, type ProductQuery, type SortKey } from '../search/search.service';
import { CatalogPresenter, PRODUCT_FULL_INCLUDE } from './catalog.presenter';
import { CategoryService } from './category.service';

const LIVE: Prisma.ProductWhereInput = { status: 'ACTIVE', deletedAt: null };

export interface ListingInput {
  q?: string;
  category?: string;
  collection?: string;
  facets: Record<string, string[]>;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  sort?: SortKey;
  page: number;
  limit: number;
}

@Injectable()
export class CatalogPublicService {
  private readonly logger = new Logger(CatalogPublicService.name);
  private readonly presenter: CatalogPresenter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoryService,
    private readonly search: SearchService,
    private readonly media: MediaService,
  ) {
    this.presenter = new CatalogPresenter(media);
  }

  categoryTree() {
    return this.categories.tree({ activeOnly: true });
  }

  /** Category page header: breadcrumb, children and the facet definitions for its listing. */
  async categoryBySlug(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: { isActive: true, OR: [{ slugAr: slug }, { slugEn: slug }] },
      include: { image: true, sizeGuide: true, children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { image: true } } },
    });
    if (!category) throw AppError.notFound({ entity: 'category' });
    const [ancestors, attributes] = await Promise.all([
      this.categories.ancestors(category.id),
      this.categories.effectiveAttributes(category.id),
    ]);
    const { image, children, ...rest } = category;
    return {
      ...rest,
      image: image ? this.media.toDto(image) : null,
      breadcrumb: ancestors.map((a) => ({ id: a.id, nameAr: a.nameAr, nameEn: a.nameEn, slugAr: a.slugAr, slugEn: a.slugEn })),
      children: children.map(({ image: childImage, ...c }) => ({ ...c, image: childImage ? this.media.toDto(childImage) : null })),
      facets: attributes
        .filter((a) => a.isFacet)
        .map((a) => ({
          key: a.attribute.key,
          nameAr: a.attribute.nameAr,
          nameEn: a.attribute.nameEn,
          type: a.attribute.type,
          unit: a.attribute.unit,
          values: a.attribute.values.map((v) => ({ code: v.code, labelAr: v.labelAr, labelEn: v.labelEn, swatchHex: v.swatchHex })),
        })),
    };
  }

  async listProducts(input: ListingInput) {
    const category = input.category
      ? await this.prisma.category.findFirst({ where: { isActive: true, OR: [{ slugAr: input.category }, { slugEn: input.category }] }, select: { id: true } })
      : null;
    if (input.category && !category) throw AppError.notFound({ entity: 'category' });
    const collection = input.collection ? await this.liveCollection(input.collection) : null;

    const query: ProductQuery = {
      q: input.q,
      categoryId: category?.id,
      collectionId: collection?.id,
      facets: input.facets,
      priceMin: input.priceMin,
      priceMax: input.priceMax,
      inStock: input.inStock,
      sort: input.sort,
      page: input.page,
      limit: input.limit,
    };
    try {
      return { ...(await this.search.searchProducts(query)), degraded: false };
    } catch (err) {
      this.logger.warn({ err }, 'Search unavailable, serving listing from the database');
      return { ...(await this.listFromDatabase(query)), degraded: true };
    }
  }

  suggest(q: string) {
    return this.search.suggest(q);
  }

  async productBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { ...LIVE, OR: [{ slugAr: slug }, { slugEn: slug }] },
      include: { ...PRODUCT_FULL_INCLUDE, relations: { orderBy: { sortOrder: 'asc' }, include: { related: { include: PRODUCT_FULL_INCLUDE } } } },
    });
    if (!product) throw AppError.notFound({ entity: 'product' });
    const breadcrumb = [...(await this.categories.ancestors(product.categoryId)), product.category].map((c) => ({
      id: c.id,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      slugAr: c.slugAr,
      slugEn: c.slugEn,
    }));

    const relatedLive = product.relations.filter((r) => r.related.status === 'ACTIVE' && !r.related.deletedAt);
    const related = {
      completeTheLook: relatedLive.filter((r) => r.type === 'COMPLETE_THE_LOOK').map((r) => this.presenter.card(r.related)),
      crossSell: relatedLive.filter((r) => r.type !== 'COMPLETE_THE_LOOK').map((r) => this.presenter.card(r.related)),
      // Fallback merchandising: other products from the same category.
      similar: (
        await this.prisma.product.findMany({
          where: { ...LIVE, categoryId: product.categoryId, id: { not: product.id } },
          include: PRODUCT_FULL_INCLUDE,
          orderBy: { publishedAt: 'desc' },
          take: 8,
        })
      ).map((p) => this.presenter.card(p)),
    };
    return { ...this.presenter.detail(product), breadcrumb, related };
  }

  async collectionBySlug(slug: string) {
    const collection = await this.liveCollection(slug);
    if (!collection) throw AppError.notFound({ entity: 'collection' });
    const { image, ...rest } = collection;
    return { ...rest, image: image ? this.media.toDto(image) : null };
  }

  private liveCollection(slug: string) {
    const now = new Date();
    return this.prisma.collection.findFirst({
      where: {
        isActive: true,
        OR: [{ slugAr: slug }, { slugEn: slug }],
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      include: { image: true },
    });
  }

  /** Degraded listing: category/collection/price filters and sorting, no facet counts. */
  private async listFromDatabase(q: ProductQuery) {
    const categoryIds = q.categoryId ? await this.descendantIds(q.categoryId) : undefined;
    const where: Prisma.ProductWhereInput = {
      ...LIVE,
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
      ...(q.collectionId ? { collections: { some: { collectionId: q.collectionId } } } : {}),
      ...(q.q ? { OR: [{ nameAr: { contains: q.q, mode: 'insensitive' } }, { nameEn: { contains: q.q, mode: 'insensitive' } }] } : {}),
      ...(q.priceMin !== undefined || q.priceMax !== undefined ? { basePrice: { gte: q.priceMin, lte: q.priceMax } } : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      q.sort === 'price_asc' ? { basePrice: 'asc' } : q.sort === 'price_desc' ? { basePrice: 'desc' } : q.sort === 'rating' ? { ratingAvg: 'desc' } : { publishedAt: 'desc' };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: PRODUCT_FULL_INCLUDE, orderBy, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map((p) => this.presenter.card(p)), total, page: q.page, limit: q.limit, facetCounts: {}, priceRange: null };
  }

  private async descendantIds(rootId: string): Promise<string[]> {
    const all = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    const ids = [rootId];
    for (let i = 0; i < ids.length; i++) for (const c of all) if (c.parentId === ids[i] && !ids.includes(c.id)) ids.push(c.id);
    return ids;
  }
}

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { normalizeArabic } from '@hudhud/domain';
import { MeiliClient } from './meili-client';
import { AppConfig } from '../../core/config/app-config.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CatalogPresenter, PRODUCT_FULL_INCLUDE, type ProductFull } from '../catalog/catalog.presenter';
import { MediaService } from '../media/media.service';

export interface ProductDocument {
  id: string;
  searchAr: string;
  searchEn: string;
  nameEn: string;
  skus: string[];
  categoryIds: string[];
  vertical: string;
  /** "attributeKey:code" for product attributes and active variant options. */
  facets: string[];
  collectionIds: string[];
  price: number;
  discountPercent: number;
  inStock: boolean;
  isMadeToMeasure: boolean;
  ratingAvg: number;
  publishedAt: number;
  /** Pre-rendered card so listings need no database round-trip. */
  card: ReturnType<CatalogPresenter['card']>;
}

export type SortKey = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'discount';

const SORTS: Record<SortKey, string[] | undefined> = {
  relevance: undefined,
  newest: ['publishedAt:desc'],
  price_asc: ['price:asc'],
  price_desc: ['price:desc'],
  rating: ['ratingAvg:desc'],
  discount: ['discountPercent:desc'],
};

export interface ProductQuery {
  q?: string;
  categoryId?: string;
  collectionId?: string;
  /** attributeKey → selected codes (OR within an attribute, AND across attributes). */
  facets?: Record<string, string[]>;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  sort?: SortKey;
  page: number;
  limit: number;
}

export interface ProductSearchResult {
  items: ProductDocument['card'][];
  total: number;
  page: number;
  limit: number;
  /** attributeKey → code → count (disjunctive: counts ignore the attribute's own selection). */
  facetCounts: Record<string, Record<string, number>>;
  priceRange: { min: number; max: number } | null;
}

const CODE_PATTERN = /^[\w.-]{1,64}$/;
const quote = (v: string) => `"${v.replace(/["\\]/g, '')}"`;

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly client: MeiliClient;
  private readonly indexUid: string;
  private readonly presenter: CatalogPresenter;

  constructor(
    config: AppConfig,
    private readonly prisma: PrismaService,
    media: MediaService,
  ) {
    this.client = new MeiliClient(config.get('MEILI_HOST'), config.get('MEILI_API_KEY'));
    this.indexUid = `${config.get('MEILI_INDEX_PREFIX')}products`;
    this.presenter = new CatalogPresenter(media);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureSettings();
    } catch (err) {
      this.logger.error({ err }, 'Meilisearch is unavailable; listings fall back to the database');
    }
  }

  async ensureSettings(): Promise<void> {
    await this.client.createIndex(this.indexUid, 'id');
    await this.client.updateSettings(this.indexUid, {
        // Arabic text is pre-normalized (hamza/taa marbuta/diacritics) on both sides.
        searchableAttributes: ['searchAr', 'nameEn', 'searchEn', 'skus'],
        filterableAttributes: ['categoryIds', 'vertical', 'facets', 'collectionIds', 'price', 'inStock', 'isMadeToMeasure'],
        sortableAttributes: ['price', 'publishedAt', 'ratingAvg', 'discountPercent'],
        localizedAttributes: [
          { attributePatterns: ['searchAr'], locales: ['ara'] },
          { attributePatterns: ['nameEn', 'searchEn'], locales: ['eng'] },
        ],
        // SKUs and numbers (sizes, thread counts) must match exactly.
        typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 }, disableOnAttributes: ['skus'], disableOnNumbers: true },
        faceting: { maxValuesPerFacet: 500 },
        pagination: { maxTotalHits: 5000 },
      });
  }

  buildDocument(p: ProductFull, ancestorIds: string[], collectionIds: string[]): ProductDocument {
    const card = this.presenter.card(p);
    const facetValues = new Map<string, { labelAr: string; labelEn: string | null }>();
    for (const pav of p.attributes) facetValues.set(`${pav.value.attribute.key}:${pav.value.code}`, pav.value);
    for (const v of p.variants.filter((x) => x.isActive)) {
      for (const o of v.options) facetValues.set(`${o.value.attribute.key}:${o.value.code}`, o.value);
    }
    const labelsAr = [...facetValues.values()].map((v) => v.labelAr);
    const labelsEn = [...facetValues.values()].map((v) => v.labelEn ?? '');
    return {
      id: p.id,
      searchAr: normalizeArabic([p.nameAr, p.category.nameAr, ...labelsAr, (p.descriptionAr ?? '').slice(0, 600)].join(' ')),
      searchEn: [p.nameEn ?? '', p.category.nameEn ?? '', ...labelsEn, (p.descriptionEn ?? '').slice(0, 600)].join(' ').toLowerCase(),
      nameEn: p.nameEn ?? '',
      skus: p.variants.map((v) => v.sku),
      categoryIds: [p.categoryId, ...ancestorIds],
      vertical: p.category.vertical,
      facets: [...facetValues.keys()],
      collectionIds,
      price: card.price,
      discountPercent: card.discountPercent,
      inStock: card.inStock,
      isMadeToMeasure: p.isMadeToMeasure,
      ratingAvg: card.ratingAvg,
      publishedAt: p.publishedAt ? Math.floor(p.publishedAt.getTime() / 1000) : 0,
      card,
    };
  }

  /** Re-index the given products (removing those that are no longer active). */
  async syncProducts(ids: string[]): Promise<{ indexed: number; removed: number }> {
    if (ids.length === 0) return { indexed: 0, removed: 0 };
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, status: 'ACTIVE', deletedAt: null },
      include: { ...PRODUCT_FULL_INCLUDE, collections: { select: { collectionId: true } } },
    });
    const ancestors = await this.ancestorMap();
    const docs = products.map((p) => this.buildDocument(p, ancestors.get(p.categoryId) ?? [], p.collections.map((c) => c.collectionId)));
    const active = new Set(docs.map((d) => d.id));
    const removed = ids.filter((id) => !active.has(id));
    if (docs.length) await this.client.addDocuments(this.indexUid, docs);
    if (removed.length) await this.client.deleteDocuments(this.indexUid, removed);
    return { indexed: docs.length, removed: removed.length };
  }

  async reindexAll(): Promise<{ indexed: number }> {
    await this.ensureSettings();
    await this.client.deleteAllDocuments(this.indexUid);
    let indexed = 0;
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.product.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 200,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      indexed += (await this.syncProducts(batch.map((b) => b.id))).indexed;
      cursor = batch[batch.length - 1]!.id;
    }
    return { indexed };
  }

  async searchProducts(query: ProductQuery): Promise<ProductSearchResult> {
    const q = query.q ? normalizeArabic(query.q).slice(0, 200) : '';
    const facetFilters = Object.entries(query.facets ?? {})
      .map(([key, codes]) => [key, codes.filter((c) => CODE_PATTERN.test(c))] as const)
      .filter(([key, codes]) => CODE_PATTERN.test(key) && codes.length > 0);

    const base: string[] = [];
    if (query.categoryId) base.push(`categoryIds = ${quote(query.categoryId)}`);
    if (query.collectionId) base.push(`collectionIds = ${quote(query.collectionId)}`);
    if (query.inStock) base.push('inStock = true');
    if (query.priceMin !== undefined) base.push(`price >= ${Math.trunc(query.priceMin)}`);
    if (query.priceMax !== undefined) base.push(`price <= ${Math.trunc(query.priceMax)}`);
    const facetClause = (key: string, codes: readonly string[]) => codes.map((c) => `facets = ${quote(`${key}:${c}`)}`);

    const mainFilter: Array<string | string[]> = [...base, ...facetFilters.map(([k, c]) => facetClause(k, c))];
    const main = {
      indexUid: this.indexUid,
      q,
      filter: mainFilter,
      sort: SORTS[query.sort ?? (q ? 'relevance' : 'newest')],
      facets: ['facets', 'price'],
      hitsPerPage: query.limit,
      page: query.page,
      attributesToRetrieve: ['card'],
    };
    // Disjunctive faceting: for each selected attribute, count values without that attribute's filter.
    const disjunctive = facetFilters.map(([key]) => ({
      indexUid: this.indexUid,
      q,
      filter: [...base, ...facetFilters.filter(([k]) => k !== key).map(([k, c]) => facetClause(k, c))],
      facets: ['facets'],
      hitsPerPage: 0,
      page: 1,
    }));

    // Precise first (every word must match); relax only when that finds nothing.
    let results = await this.client.multiSearch<ProductDocument>(
      [main, ...disjunctive].map((query) => ({ ...query, matchingStrategy: 'all' as const })),
    );
    if (q && (results[0]!.totalHits ?? 0) === 0) {
      results = await this.client.multiSearch<ProductDocument>([main, ...disjunctive].map((query) => ({ ...query, matchingStrategy: 'last' as const })));
    }
    const [first, ...rest] = results;
    const facetCounts = groupFacets(first!.facetDistribution?.['facets'] ?? {});
    facetFilters.forEach(([key], i) => {
      facetCounts[key] = groupFacets(rest[i]!.facetDistribution?.['facets'] ?? {})[key] ?? {};
    });
    const stats = first!.facetStats?.['price'];
    return {
      items: first!.hits.map((h) => h.card),
      total: first!.totalHits ?? first!.estimatedTotalHits ?? 0,
      page: query.page,
      limit: query.limit,
      facetCounts,
      priceRange: stats ? { min: stats.min, max: stats.max } : null,
    };
  }

  async suggest(q: string, limit = 6) {
    const normalized = normalizeArabic(q).slice(0, 100);
    if (normalized.length < 2) return { products: [] };
    const res = await this.client.search<ProductDocument>({ indexUid: this.indexUid, q: normalized, limit, attributesToRetrieve: ['card'], matchingStrategy: 'all' });
    return {
      products: res.hits.map((h) => {
        const c = h.card;
        return { id: c.id, slugAr: c.slugAr, slugEn: c.slugEn, nameAr: c.nameAr, nameEn: c.nameEn, image: c.image?.thumbnailUrl ?? null, price: c.price };
      }),
    };
  }

  async isHealthy(): Promise<boolean> {
    return this.client.isHealthy();
  }

  /** categoryId → ancestor ids (closest first). */
  private async ancestorMap(): Promise<Map<string, string[]>> {
    const all = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    const parent = new Map(all.map((c) => [c.id, c.parentId]));
    const result = new Map<string, string[]>();
    for (const c of all) {
      const chain: string[] = [];
      let cur = c.parentId;
      while (cur && !chain.includes(cur)) {
        chain.push(cur);
        cur = parent.get(cur) ?? null;
      }
      result.set(c.id, chain);
    }
    return result;
  }
}

export function groupFacets(distribution: Record<string, number>): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [token, count] of Object.entries(distribution)) {
    const i = token.indexOf(':');
    if (i <= 0) continue;
    const key = token.slice(0, i);
    (out[key] ??= {})[token.slice(i + 1)] = count;
  }
  return out;
}

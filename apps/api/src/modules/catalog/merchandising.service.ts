import { Injectable } from '@nestjs/common';
import { slugify } from '@hudhud/domain';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SearchSync } from '../search/search-sync';
import type {
  BrandDto,
  CollectionDto,
  CollectionProductsDto,
  SizeGuideDto,
  UpdateBrandDto,
  UpdateCollectionDto,
  UpdateSizeGuideDto,
} from './catalog.dto';
import { freeSlug } from './category.service';

/** Brands, size guides and collections. */
@Injectable()
export class MerchandisingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SearchSync,
  ) {}

  brands() {
    return this.prisma.brand.findMany({ orderBy: { nameAr: 'asc' } });
  }

  async createBrand(dto: BrandDto) {
    const slug =
      dto.slug ??
      (await freeSlug(slugify(dto.nameEn ?? '', 'en') || `brand-${Date.now().toString(36)}`, async (c) =>
        (await this.prisma.brand.findMany({ where: { slug: { in: c } }, select: { slug: true } })).map((b) => b.slug),
      ));
    return this.prisma.brand.create({ data: { ...dto, slug } });
  }

  updateBrand(id: string, dto: UpdateBrandDto) {
    return this.prisma.brand.update({ where: { id }, data: dto });
  }

  sizeGuides() {
    return this.prisma.sizeGuide.findMany({ orderBy: { key: 'asc' } });
  }

  async createSizeGuide(dto: SizeGuideDto) {
    this.assertTable(dto.columns, dto.rows);
    const { columns, rows, ...rest } = dto;
    return this.prisma.sizeGuide.create({ data: { ...rest, table: { columns, rows } as unknown as Prisma.InputJsonValue } });
  }

  async updateSizeGuide(id: string, dto: UpdateSizeGuideDto) {
    const current = await this.prisma.sizeGuide.findUnique({ where: { id } });
    if (!current) throw AppError.notFound();
    const { columns, rows, ...rest } = dto;
    const table = current.table as { columns: unknown[]; rows: unknown[][] };
    const next = { columns: columns ?? table.columns, rows: rows ?? table.rows };
    this.assertTable(next.columns, next.rows);
    return this.prisma.sizeGuide.update({ where: { id }, data: { ...rest, table: next as unknown as Prisma.InputJsonValue } });
  }

  collections() {
    return this.prisma.collection.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], include: { _count: { select: { products: true } } } });
  }

  async createCollection(dto: CollectionDto) {
    const slugAr = dto.slugAr ?? (await this.collectionSlug(slugify(dto.nameAr, 'ar'), 'slugAr'));
    const slugEn = dto.slugEn ?? (await this.collectionSlug(slugify(dto.nameEn ?? '', 'en') || `collection-${Date.now().toString(36)}`, 'slugEn'));
    this.assertWindow(dto.startsAt, dto.endsAt);
    return this.prisma.collection.create({ data: { ...dto, slugAr, slugEn } });
  }

  async updateCollection(id: string, dto: UpdateCollectionDto) {
    this.assertWindow(dto.startsAt, dto.endsAt);
    return this.prisma.collection.update({ where: { id }, data: dto });
  }

  async setCollectionProducts(id: string, dto: CollectionProductsDto) {
    if (!(await this.prisma.collection.findUnique({ where: { id } }))) throw AppError.notFound();
    const before = await this.prisma.collectionProduct.findMany({ where: { collectionId: id }, select: { productId: true } });
    const unique = [...new Set(dto.productIds)];
    if ((await this.prisma.product.count({ where: { id: { in: unique }, deletedAt: null } })) !== unique.length) {
      throw AppError.badRequest('validation', { field: 'productIds' });
    }
    await this.prisma.$transaction([
      this.prisma.collectionProduct.deleteMany({ where: { collectionId: id } }),
      this.prisma.collectionProduct.createMany({ data: unique.map((productId, sortOrder) => ({ collectionId: id, productId, sortOrder })) }),
    ]);
    await this.sync.products([...unique, ...before.map((b) => b.productId)]);
    return { collectionId: id, productIds: unique };
  }

  private assertTable(columns: unknown[], rows: unknown[][]) {
    if (!rows.every((r) => Array.isArray(r) && r.length === columns.length && r.every((c) => ['string', 'number'].includes(typeof c)))) {
      throw AppError.badRequest('validation', { reason: 'sizeGuideShape' });
    }
  }

  private assertWindow(startsAt?: string | null, endsAt?: string | null) {
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw AppError.badRequest('validation', { reason: 'endsBeforeStarts' });
  }

  private collectionSlug(base: string, field: 'slugAr' | 'slugEn') {
    return freeSlug(base, async (candidates) =>
      (
        await this.prisma.collection.findMany({ where: { [field]: { in: candidates } } as Prisma.CollectionWhereInput, select: { slugAr: true, slugEn: true } })
      ).map((r) => r[field]),
    );
  }
}

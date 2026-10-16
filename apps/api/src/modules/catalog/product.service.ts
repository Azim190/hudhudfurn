import { Injectable } from '@nestjs/common';
import {
  computeCompleteness,
  diffVariantMatrix,
  generateVariantMatrix,
  slugify,
  VariantMatrixError,
} from '@hudhud/domain';
import { Prisma, type Vertical } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { SearchSync } from '../search/search-sync';
import { availableQuantity, CatalogPresenter, PRODUCT_FULL_INCLUDE, type ProductFull } from './catalog.presenter';
import type {
  AdminProductQueryDto,
  GenerateVariantsDto,
  ProductDto,
  ProductMediaDto,
  ProductRelationsDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './catalog.dto';
import { CategoryService, freeSlug } from './category.service';

const SKU_PREFIX: Record<Vertical, string> = {
  CURTAINS: 'CUR',
  BEDDING: 'BED',
  SOFA_COVERS: 'SOF',
  ABAYAS: 'ABY',
  ACCESSORIES: 'ACC',
};

const ADMIN_INCLUDE = {
  ...PRODUCT_FULL_INCLUDE,
  variants: {
    ...PRODUCT_FULL_INCLUDE.variants,
    include: {
      ...PRODUCT_FULL_INCLUDE.variants.include,
      stock: { include: { location: { select: { id: true, code: true, nameAr: true, nameEn: true, isActive: true } } } },
    },
  },
  relations: { include: { related: { select: { id: true, nameAr: true, nameEn: true, skuPrefix: true } } } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductService {
  private readonly presenter: CatalogPresenter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoryService,
    private readonly sync: SearchSync,
    private readonly media: MediaService,
  ) {
    this.presenter = new CatalogPresenter(media);
  }

  async list(q: AdminProductQueryDto) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: q.status,
      categoryId: q.categoryId,
      ...(q.q
        ? {
            OR: [
              { nameAr: { contains: q.q, mode: 'insensitive' } },
              { nameEn: { contains: q.q, mode: 'insensitive' } },
              { skuPrefix: { contains: q.q.toUpperCase() } },
              { variants: { some: { sku: { contains: q.q.toUpperCase() } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_FULL_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: rows.map((p) => ({
        ...this.presenter.card(p),
        status: p.status,
        skuPrefix: p.skuPrefix,
        category: p.category,
        variantCount: p.variants.filter((v) => v.isActive).length,
        totalStock: p.variants.reduce((s, v) => s + availableQuantity(v), 0),
        completeness: this.completenessOf(p).score,
        updatedAt: p.updatedAt,
      })),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  async get(id: string) {
    const p = await this.prisma.product.findFirst({ where: { id, deletedAt: null }, include: ADMIN_INCLUDE });
    if (!p) throw AppError.notFound({ entity: 'product' });
    const effective = await this.categories.effectiveAttributes(p.categoryId);
    return {
      ...p,
      basePrice: p.basePrice,
      ratingAvg: Number(p.ratingAvg),
      attributeValueIds: p.attributes.map((a) => a.attributeValueId),
      media: p.media.map((m) => ({ ...this.media.toDto(m.media), variantId: m.variantId, sortOrder: m.sortOrder })),
      variants: p.variants.map((v) => ({
        ...v,
        options: v.options.map((o) => ({ attributeKey: o.value.attribute.key, valueId: o.value.id, code: o.value.code, labelAr: o.value.labelAr, labelEn: o.value.labelEn })),
        available: availableQuantity(v),
      })),
      categoryAttributes: effective.map((ca) => ({
        attributeId: ca.attributeId,
        key: ca.attribute.key,
        nameAr: ca.attribute.nameAr,
        nameEn: ca.attribute.nameEn,
        type: ca.attribute.type,
        isFacet: ca.isFacet,
        isVariantAxis: ca.isVariantAxis,
        isRequired: ca.isRequired,
        values: ca.attribute.values,
      })),
      completeness: this.completenessOf(p),
    };
  }

  async create(dto: ProductDto) {
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw AppError.badRequest('validation', { field: 'categoryId' });
    const skuPrefix = dto.skuPrefix ?? (await this.nextSkuPrefix(category.vertical));
    if (await this.prisma.product.findUnique({ where: { skuPrefix } })) throw AppError.conflict('conflict', { field: 'skuPrefix' });
    if (dto.attributeValueIds?.length) await this.assertProductAttributes(dto.categoryId, dto.attributeValueIds);
    if (dto.configuratorTemplateId) await this.assertTemplate(dto.configuratorTemplateId, dto.pricingMode ?? 'FIXED');

    const slugAr = dto.slugAr ?? (await this.slug(slugify(dto.nameAr, 'ar'), 'slugAr'));
    const slugEn = dto.slugEn ?? (await this.slug(slugify(dto.nameEn ?? '', 'en') || skuPrefix.toLowerCase(), 'slugEn'));
    const { attributeValueIds, ...data } = dto;

    const product = await this.prisma.product.create({
      data: {
        ...data,
        skuPrefix,
        slugAr,
        slugEn,
        status: 'DRAFT',
        attributes: attributeValueIds?.length ? { create: attributeValueIds.map((attributeValueId) => ({ attributeValueId })) } : undefined,
        // Every product starts with one default variant so simple items are sellable without a matrix.
        variants: { create: [{ sku: skuPrefix, optionKey: '', isDefault: true }] },
      },
    });
    return this.get(product.id);
  }

  /** Curtain, blind and sofa templates price the whole item (CALCULATED); abaya templates add custom tailoring to any product. */
  private async assertTemplate(templateId: string, pricingMode: string) {
    const t = await this.prisma.configuratorTemplate.findUnique({ where: { id: templateId }, select: { kind: true } });
    if (!t) throw AppError.badRequest('validation', { field: 'configuratorTemplateId' });
    if (t.kind !== 'ABAYA' && pricingMode !== 'CALCULATED') throw AppError.badRequest('validation', { field: 'configuratorTemplateId', reason: 'requiresCalculatedPricing' });
  }

  async update(id: string, dto: UpdateProductDto) {
    const current = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw AppError.notFound({ entity: 'product' });
    if (dto.skuPrefix && dto.skuPrefix !== current.skuPrefix) throw AppError.badRequest('validation', { reason: 'skuPrefixImmutable' });
    const categoryId = dto.categoryId ?? current.categoryId;
    if (dto.categoryId && dto.categoryId !== current.categoryId) {
      if (!(await this.prisma.category.findUnique({ where: { id: dto.categoryId } }))) throw AppError.badRequest('validation', { field: 'categoryId' });
    }
    if (dto.attributeValueIds) await this.assertProductAttributes(categoryId, dto.attributeValueIds);
    const templateId = dto.configuratorTemplateId === undefined ? current.configuratorTemplateId : dto.configuratorTemplateId;
    if (templateId) await this.assertTemplate(templateId, dto.pricingMode ?? current.pricingMode);

    const { attributeValueIds, skuPrefix: _sku, ...data } = dto;
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data });
      if (attributeValueIds) {
        await tx.productAttributeValue.deleteMany({ where: { productId: id } });
        if (attributeValueIds.length) {
          await tx.productAttributeValue.createMany({ data: attributeValueIds.map((attributeValueId) => ({ productId: id, attributeValueId })) });
        }
      }
    });
    if (current.status === 'ACTIVE') {
      const after = await this.prisma.product.findUniqueOrThrow({ where: { id }, include: PRODUCT_FULL_INCLUDE });
      // An edit must not leave a live product unpublishable (e.g. Arabic description removed).
      const check = this.completenessOf(after);
      if (!check.canPublish) {
        await this.prisma.product.update({ where: { id }, data: { status: 'DRAFT' } });
      }
    }
    await this.sync.products([id]);
    return this.get(id);
  }

  async publish(id: string) {
    const p = await this.prisma.product.findFirst({ where: { id, deletedAt: null }, include: PRODUCT_FULL_INCLUDE });
    if (!p) throw AppError.notFound({ entity: 'product' });
    const completeness = this.completenessOf(p);
    if (!completeness.canPublish) throw AppError.badRequest('validation', { reason: 'incomplete', missing: completeness.missing });
    await this.prisma.product.update({ where: { id }, data: { status: 'ACTIVE', publishedAt: p.publishedAt ?? new Date() } });
    await this.sync.products([id]);
    return this.get(id);
  }

  async unpublish(id: string, status: 'DRAFT' | 'ARCHIVED') {
    await this.assertProduct(id);
    await this.prisma.product.update({ where: { id }, data: { status } });
    await this.sync.products([id]);
    return this.get(id);
  }

  /** Soft delete: order history references products and variants, so rows are kept. */
  async remove(id: string) {
    await this.assertProduct(id);
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
    await this.sync.products([id]);
  }

  async generateVariants(id: string, dto: GenerateVariantsDto) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { variants: { include: { options: true } } },
    });
    if (!product) throw AppError.notFound({ entity: 'product' });
    const effective = await this.categories.effectiveAttributes(product.categoryId);

    const axes = dto.axes.map((axis) => {
      const ca = effective.find((e) => e.attribute.key === axis.attributeKey);
      if (!ca?.isVariantAxis) throw AppError.badRequest('validation', { reason: 'notVariantAxis', attributeKey: axis.attributeKey });
      const values = axis.valueCodes.map((code) => {
        const value = ca.attribute.values.find((v) => v.code === code);
        if (!value) throw AppError.badRequest('validation', { reason: 'unknownValue', attributeKey: axis.attributeKey, code });
        return value;
      });
      return { attributeKey: axis.attributeKey, values };
    });

    let combos;
    try {
      combos = generateVariantMatrix(axes, product.skuPrefix);
    } catch (err) {
      if (err instanceof VariantMatrixError) throw AppError.badRequest('validation', { reason: err.message });
      throw err;
    }
    const diff = diffVariantMatrix(product.variants.map((v) => v.optionKey), combos);
    const existingSkus = new Set(
      (await this.prisma.productVariant.findMany({ where: { sku: { in: diff.toCreate.map((c) => c.sku) } }, select: { sku: true } })).map((v) => v.sku),
    );
    const maxSort = Math.max(0, ...product.variants.map((v) => v.sortOrder));

    await this.prisma.$transaction(async (tx) => {
      for (const [i, combo] of diff.toCreate.entries()) {
        await tx.productVariant.create({
          data: {
            productId: id,
            sku: existingSkus.has(combo.sku) ? `${combo.sku}-${Date.now().toString(36).toUpperCase()}` : combo.sku,
            optionKey: combo.key,
            price: dto.price ?? null,
            sortOrder: maxSort + i + 1,
            isDefault: false,
            options: { create: combo.options.map((o) => ({ attributeValueId: o.value.id })) },
          },
        });
      }
      await tx.productVariant.updateMany({ where: { productId: id, optionKey: { in: diff.toDeactivate } }, data: { isActive: false, isDefault: false } });
      await tx.productVariant.updateMany({ where: { productId: id, optionKey: { in: diff.unchanged } }, data: { isActive: true } });
      await this.ensureDefaultVariant(tx, id);
    });
    await this.sync.products([id]);
    const activeKeys = new Set(product.variants.filter((v) => v.isActive).map((v) => v.optionKey));
    const deactivated = diff.toDeactivate.filter((k) => activeKeys.has(k)).length;
    return { created: diff.toCreate.length, deactivated, product: await this.get(id) };
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw AppError.notFound({ entity: 'variant' });
    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.productVariant.updateMany({ where: { productId: variant.productId }, data: { isDefault: false } });
      await tx.productVariant.update({
        where: { id: variantId },
        data: { ...dto, isDefault: dto.isActive === false ? false : dto.isDefault },
      });
      await this.ensureDefaultVariant(tx, variant.productId);
    });
    await this.sync.products([variant.productId]);
    return this.get(variant.productId);
  }

  async setMedia(id: string, dto: ProductMediaDto) {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null }, include: { variants: { select: { id: true } } } });
    if (!product) throw AppError.notFound({ entity: 'product' });
    const mediaIds = dto.items.map((i) => i.mediaId);
    if (new Set(mediaIds).size !== mediaIds.length) throw AppError.badRequest('validation', { reason: 'duplicateMedia' });
    if ((await this.prisma.mediaAsset.count({ where: { id: { in: mediaIds } } })) !== mediaIds.length) {
      throw AppError.badRequest('validation', { field: 'mediaId' });
    }
    const variantIds = new Set(product.variants.map((v) => v.id));
    if (dto.items.some((i) => i.variantId && !variantIds.has(i.variantId))) throw AppError.badRequest('validation', { field: 'variantId' });

    await this.prisma.$transaction([
      this.prisma.productMedia.deleteMany({ where: { productId: id } }),
      this.prisma.productMedia.createMany({
        data: dto.items.map((item, sortOrder) => ({ productId: id, mediaId: item.mediaId, variantId: item.variantId ?? null, sortOrder })),
      }),
    ]);
    await this.sync.products([id]);
    return this.get(id);
  }

  async setRelations(id: string, dto: ProductRelationsDto) {
    await this.assertProduct(id);
    if (dto.items.some((i) => i.relatedId === id)) throw AppError.badRequest('validation', { reason: 'selfRelation' });
    const ids = [...new Set(dto.items.map((i) => i.relatedId))];
    if ((await this.prisma.product.count({ where: { id: { in: ids }, deletedAt: null } })) !== ids.length) {
      throw AppError.badRequest('validation', { field: 'relatedId' });
    }
    await this.prisma.$transaction([
      this.prisma.productRelation.deleteMany({ where: { productId: id } }),
      this.prisma.productRelation.createMany({
        data: dto.items.map((i, sortOrder) => ({ productId: id, relatedId: i.relatedId, type: i.type, sortOrder })),
        skipDuplicates: true,
      }),
    ]);
    return this.get(id);
  }

  completenessOf(p: ProductFull) {
    return computeCompleteness({
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      descriptionAr: p.descriptionAr,
      descriptionEn: p.descriptionEn,
      careAr: p.careAr,
      careEn: p.careEn,
      seoTitleAr: p.seoTitleAr,
      seoTitleEn: p.seoTitleEn,
      seoDescriptionAr: p.seoDescriptionAr,
      seoDescriptionEn: p.seoDescriptionEn,
      imageCount: p.media.length,
      imagesMissingAlt: p.media.filter((m) => !m.media.altAr?.trim()).length,
      activeVariantCount: p.variants.filter((v) => v.isActive).length,
      hasPrice: p.basePrice > 0 || p.variants.some((v) => v.isActive && (v.price ?? 0) > 0),
    });
  }

  private async ensureDefaultVariant(tx: Prisma.TransactionClient, productId: string) {
    const active = await tx.productVariant.findMany({ where: { productId, isActive: true }, orderBy: { sortOrder: 'asc' } });
    if (active.length && !active.some((v) => v.isDefault)) {
      await tx.productVariant.update({ where: { id: active[0]!.id }, data: { isDefault: true } });
    }
  }

  /** Non-variant attribute values must belong to attributes configured for the category. */
  private async assertProductAttributes(categoryId: string, valueIds: string[]) {
    const effective = await this.categories.effectiveAttributes(categoryId);
    const allowed = new Set(effective.filter((e) => !e.isVariantAxis).flatMap((e) => e.attribute.values.map((v) => v.id)));
    const invalid = valueIds.filter((v) => !allowed.has(v));
    if (invalid.length) throw AppError.badRequest('validation', { field: 'attributeValueIds', invalid });
  }

  private async nextSkuPrefix(vertical: Vertical): Promise<string> {
    const prefix = SKU_PREFIX[vertical];
    const last = await this.prisma.product.findFirst({
      where: { skuPrefix: { startsWith: `${prefix}-` } },
      orderBy: { skuPrefix: 'desc' },
      select: { skuPrefix: true },
    });
    const n = last ? Number(last.skuPrefix.slice(prefix.length + 1)) || 0 : 0;
    return `${prefix}-${String(n + 1).padStart(4, '0')}`;
  }

  private async assertProduct(id: string) {
    const p = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!p) throw AppError.notFound({ entity: 'product' });
    return p;
  }

  private slug(base: string, field: 'slugAr' | 'slugEn') {
    return freeSlug(base, async (candidates) => {
      const rows = await this.prisma.product.findMany({
        where: { [field]: { in: candidates } } as Prisma.ProductWhereInput,
        select: { slugAr: true, slugEn: true },
      });
      return rows.map((r) => r[field]);
    });
  }
}

import { Injectable } from '@nestjs/common';
import { slugify, uniqueSlug } from '@hudhud/domain';
import type { Category, Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { SearchSync } from '../search/search-sync';
import type { CategoryAttributesDto, CategoryDto, UpdateCategoryDto } from './catalog.dto';

export interface CategoryNode extends Category {
  children: CategoryNode[];
  productCount: number;
  imageUrl: string | null;
}

/** Slug helper shared by catalog entities with bilingual unique slugs. */
export async function freeSlug(
  base: string,
  exists: (candidates: string[]) => Promise<string[]>,
): Promise<string> {
  const taken = new Set(await exists([base, ...Array.from({ length: 50 }, (_, i) => `${base}-${i + 2}`)]));
  return uniqueSlug(base, (s) => taken.has(s));
}

@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly sync: SearchSync,
  ) {}

  async tree(opts: { activeOnly: boolean }): Promise<CategoryNode[]> {
    const [categories, counts] = await Promise.all([
      this.prisma.category.findMany({
        where: opts.activeOnly ? { isActive: true } : undefined,
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
        include: { image: true },
      }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: { deletedAt: null, ...(opts.activeOnly ? { status: 'ACTIVE' } : {}) },
        _count: { _all: true },
      }),
    ]);
    const countBy = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    const nodes = new Map<string, CategoryNode>();
    for (const { image, ...c } of categories) {
      nodes.set(c.id, { ...c, children: [], productCount: countBy.get(c.id) ?? 0, imageUrl: image ? this.media.toDto(image).url : null });
    }
    const roots: CategoryNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else if (!node.parentId) roots.push(node);
    }
    // Parent counts include their descendants.
    const total = (n: CategoryNode): number => (n.productCount += n.children.reduce((s, c) => s + total(c), 0));
    roots.forEach(total);
    return roots;
  }

  async get(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { attributes: { include: { attribute: { include: { values: { orderBy: { sortOrder: 'asc' } } } } }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!category) throw AppError.notFound();
    return category;
  }

  async create(dto: CategoryDto) {
    if (dto.parentId) await this.assertExists(dto.parentId);
    const slugAr = dto.slugAr ?? (await this.slug(slugify(dto.nameAr, 'ar'), 'slugAr'));
    const slugEn = dto.slugEn ?? (await this.slug(slugify(dto.nameEn ?? '', 'en') || `category-${Date.now().toString(36)}`, 'slugEn'));
    return this.prisma.category.create({ data: { ...dto, slugAr, slugEn } });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const current = await this.assertExists(id);
    if (dto.parentId !== undefined && dto.parentId !== null) await this.assertNoCycle(id, dto.parentId);
    const updated = await this.prisma.category.update({ where: { id }, data: dto });
    const searchRelevant = dto.nameAr !== undefined || dto.nameEn !== undefined || dto.parentId !== undefined || dto.vertical !== undefined;
    if (searchRelevant || dto.isActive !== undefined) await this.sync.category(id);
    return { before: current, after: updated };
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    const [children, products] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id } }),
      this.prisma.product.count({ where: { categoryId: id } }),
    ]);
    if (children || products) throw AppError.conflict('conflict', { reason: 'inUse', children, products });
    await this.prisma.category.delete({ where: { id } });
  }

  async setAttributes(id: string, dto: CategoryAttributesDto) {
    await this.assertExists(id);
    const ids = dto.items.map((i) => i.attributeId);
    if (new Set(ids).size !== ids.length) throw AppError.badRequest('validation', { reason: 'duplicateAttribute' });
    const found = await this.prisma.attribute.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw AppError.badRequest('validation', { field: 'attributeId' });
    await this.prisma.$transaction([
      this.prisma.categoryAttribute.deleteMany({ where: { categoryId: id } }),
      this.prisma.categoryAttribute.createMany({
        data: dto.items.map((i, index) => ({
          categoryId: id,
          attributeId: i.attributeId,
          isFacet: i.isFacet ?? true,
          isVariantAxis: i.isVariantAxis ?? false,
          isRequired: i.isRequired ?? false,
          sortOrder: i.sortOrder ?? index,
        })),
      }),
    ]);
    return this.get(id);
  }

  /** Ancestors from the root down to (not including) the category. */
  async ancestors(id: string): Promise<Category[]> {
    const chain: Category[] = [];
    let current = await this.prisma.category.findUnique({ where: { id } });
    while (current?.parentId && chain.length < 10) {
      current = await this.prisma.category.findUnique({ where: { id: current.parentId } });
      if (current) chain.unshift(current);
    }
    return chain;
  }

  /**
   * Attributes a category's products may use: its own configuration plus inherited ones from
   * ancestors (the closest definition wins).
   */
  async effectiveAttributes(categoryId: string) {
    const lineage = [...(await this.ancestors(categoryId)).map((c) => c.id), categoryId];
    const rows = await this.prisma.categoryAttribute.findMany({
      where: { categoryId: { in: lineage } },
      include: { attribute: { include: { values: { orderBy: [{ sortOrder: 'asc' }, { labelAr: 'asc' }] } } } },
      orderBy: { sortOrder: 'asc' },
    });
    const byAttribute = new Map<string, (typeof rows)[number]>();
    for (const categoryIdInOrder of lineage) {
      for (const row of rows.filter((r) => r.categoryId === categoryIdInOrder)) byAttribute.set(row.attributeId, row);
    }
    return [...byAttribute.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async assertExists(id: string) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw AppError.notFound({ entity: 'category' });
    return c;
  }

  private async assertNoCycle(id: string, newParentId: string) {
    if (newParentId === id) throw AppError.badRequest('validation', { reason: 'categoryCycle' });
    let cursor: string | null = newParentId;
    for (let depth = 0; cursor && depth < 20; depth++) {
      if (cursor === id) throw AppError.badRequest('validation', { reason: 'categoryCycle' });
      const row: { parentId: string | null } | null = await this.prisma.category.findUnique({ where: { id: cursor }, select: { parentId: true } });
      if (!row) throw AppError.notFound({ entity: 'category' });
      cursor = row.parentId;
    }
  }

  private slug(base: string, field: 'slugAr' | 'slugEn') {
    return freeSlug(base, async (candidates) => {
      const rows = await this.prisma.category.findMany({
        where: { [field]: { in: candidates } } as Prisma.CategoryWhereInput,
        select: { slugAr: true, slugEn: true },
      });
      return rows.map((r) => r[field]);
    });
  }
}

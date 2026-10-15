import { Injectable } from '@nestjs/common';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SearchSync } from '../search/search-sync';
import type { AttributeDto, AttributeValueDto, UpdateAttributeDto, UpdateAttributeValueDto } from './catalog.dto';

@Injectable()
export class AttributeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SearchSync,
  ) {}

  list() {
    return this.prisma.attribute.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      include: { values: { orderBy: [{ sortOrder: 'asc' }, { labelAr: 'asc' }] }, _count: { select: { categories: true } } },
    });
  }

  async create(dto: AttributeDto) {
    if (await this.prisma.attribute.findUnique({ where: { key: dto.key } })) throw AppError.conflict('conflict', { field: 'key' });
    return this.prisma.attribute.create({ data: dto, include: { values: true } });
  }

  async update(id: string, dto: UpdateAttributeDto) {
    await this.assertAttribute(id);
    if (dto.key) throw AppError.badRequest('validation', { reason: 'keyImmutable' });
    const updated = await this.prisma.attribute.update({ where: { id }, data: dto, include: { values: true } });
    if (dto.nameAr !== undefined || dto.nameEn !== undefined) await this.sync.attributeValue(updated.values.map((v) => v.id));
    return updated;
  }

  async remove(id: string) {
    await this.assertAttribute(id);
    const used = await this.usage({ attributeId: id });
    if (used) throw AppError.conflict('conflict', { reason: 'inUse', usages: used });
    await this.prisma.attribute.delete({ where: { id } });
  }

  async addValue(attributeId: string, dto: AttributeValueDto) {
    await this.assertAttribute(attributeId);
    const exists = await this.prisma.attributeValue.findUnique({ where: { attributeId_code: { attributeId, code: dto.code } } });
    if (exists) throw AppError.conflict('conflict', { field: 'code' });
    return this.prisma.attributeValue.create({ data: { ...dto, attributeId } });
  }

  async updateValue(valueId: string, dto: UpdateAttributeValueDto) {
    const value = await this.prisma.attributeValue.findUnique({ where: { id: valueId } });
    if (!value) throw AppError.notFound();
    // Codes appear in URLs, SKUs and search facets; they never change once created.
    if (dto.code && dto.code !== value.code) throw AppError.badRequest('validation', { reason: 'codeImmutable' });
    const updated = await this.prisma.attributeValue.update({ where: { id: valueId }, data: { ...dto, code: undefined } });
    await this.sync.attributeValue([valueId]);
    return updated;
  }

  async removeValue(valueId: string) {
    const value = await this.prisma.attributeValue.findUnique({ where: { id: valueId } });
    if (!value) throw AppError.notFound();
    const used = await this.usage({ valueId });
    if (used) throw AppError.conflict('conflict', { reason: 'inUse', usages: used });
    await this.prisma.attributeValue.delete({ where: { id: valueId } });
  }

  private async usage(target: { attributeId?: string; valueId?: string }) {
    const valueFilter = target.valueId ? { attributeValueId: target.valueId } : { value: { attributeId: target.attributeId! } };
    const [products, variants] = await Promise.all([
      this.prisma.productAttributeValue.count({ where: valueFilter }),
      this.prisma.variantOptionValue.count({ where: valueFilter }),
    ]);
    return products + variants;
  }

  private async assertAttribute(id: string) {
    const a = await this.prisma.attribute.findUnique({ where: { id } });
    if (!a) throw AppError.notFound({ entity: 'attribute' });
    return a;
  }
}

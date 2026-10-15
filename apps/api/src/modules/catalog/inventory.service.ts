import { Injectable } from '@nestjs/common';
import type { StockReason } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SearchSync } from '../search/search-sync';
import type { LocationDto, SetStockDto, UpdateLocationDto } from './catalog.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SearchSync,
  ) {}

  locations() {
    return this.prisma.location.findMany({ orderBy: [{ type: 'asc' }, { code: 'asc' }] });
  }

  async createLocation(dto: LocationDto) {
    if (await this.prisma.location.findUnique({ where: { code: dto.code } })) throw AppError.conflict('conflict', { field: 'code' });
    return this.prisma.location.create({ data: dto });
  }

  async updateLocation(id: string, dto: UpdateLocationDto) {
    if (!(await this.prisma.location.findUnique({ where: { id } }))) throw AppError.notFound();
    if (dto.code) throw AppError.badRequest('validation', { reason: 'codeImmutable' });
    const location = await this.prisma.location.update({ where: { id }, data: dto });
    if (dto.isActive !== undefined) {
      // Deactivating a warehouse changes availability of everything stocked there.
      const variants = await this.prisma.stockLevel.findMany({ where: { locationId: id }, select: { variant: { select: { productId: true } } } });
      await this.sync.products(variants.map((v) => v.variant.productId));
    }
    return location;
  }

  /**
   * Set the counted on-hand quantity (stocktake semantics). The change is recorded as a signed
   * movement so the stock history always reconciles with the current level.
   */
  async setStock(variantId: string, dto: SetStockDto, actorId?: string, reason: StockReason = 'ADJUSTMENT') {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId }, select: { id: true, productId: true } });
    if (!variant) throw AppError.notFound({ entity: 'variant' });
    if (!(await this.prisma.location.findUnique({ where: { id: dto.locationId } }))) throw AppError.badRequest('validation', { field: 'locationId' });

    const level = await this.prisma.$transaction(async (tx) => {
      // Lock the row so concurrent adjustments cannot lose updates.
      const rows = await tx.$queryRaw<Array<{ on_hand: number; reserved: number }>>`
        SELECT on_hand, reserved FROM stock_levels
        WHERE variant_id = ${variantId}::uuid AND location_id = ${dto.locationId}::uuid
        FOR UPDATE`;
      const current = rows[0] ?? { on_hand: 0, reserved: 0 };
      if (dto.onHand < current.reserved) {
        throw AppError.badRequest('validation', { reason: 'belowReserved', reserved: current.reserved });
      }
      const delta = dto.onHand - current.on_hand;
      const saved = await tx.stockLevel.upsert({
        where: { variantId_locationId: { variantId, locationId: dto.locationId } },
        create: { variantId, locationId: dto.locationId, onHand: dto.onHand, lowStockThreshold: dto.lowStockThreshold ?? 5 },
        update: { onHand: dto.onHand, lowStockThreshold: dto.lowStockThreshold },
      });
      if (delta !== 0) {
        await tx.stockMovement.create({
          data: { variantId, locationId: dto.locationId, quantity: delta, reason: rows.length ? reason : 'INITIAL', note: dto.note, actorId },
        });
      }
      return saved;
    });
    await this.sync.products([variant.productId]);
    return level;
  }

  movements(variantId: string, take = 100) {
    return this.prisma.stockMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { location: { select: { code: true, nameAr: true, nameEn: true } } },
    });
  }
}

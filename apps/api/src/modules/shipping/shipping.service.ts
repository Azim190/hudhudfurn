import { Injectable } from '@nestjs/common';
import { shippingOptions, zoneForCity, type ShippingOption, type ShippingZoneInput } from '@hudhud/domain';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { ShippingRateDto, ShippingZoneDto, UpdateShippingRateDto, UpdateShippingZoneDto } from './shipping.dto';

/** Items without a configured weight count as this many grams for rate bands. */
export const DEFAULT_ITEM_WEIGHT_G = 1000;

const ZONE_INCLUDE = {
  cities: { orderBy: { cityCode: 'asc' } },
  rates: { orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }] },
} satisfies Prisma.ShippingZoneInclude;

@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async activeZones(): Promise<ShippingZoneInput[]> {
    const zones = await this.prisma.shippingZone.findMany({
      where: { isActive: true },
      include: { cities: true, rates: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    return zones.map((z) => ({
      id: z.id,
      cityCodes: z.cities.map((c) => c.cityCode),
      rates: z.rates.map((r) => ({
        id: r.id,
        carrier: r.carrier,
        method: r.method,
        nameAr: r.nameAr,
        nameEn: r.nameEn,
        minWeightG: r.minWeightG,
        maxWeightG: r.maxWeightG,
        price: r.price,
        freeAbove: r.freeAbove,
        etaMinDays: r.etaMinDays,
        etaMaxDays: r.etaMaxDays,
      })),
    }));
  }

  async productionDays(madeToMeasure: boolean) {
    if (!madeToMeasure) return undefined;
    const eta = await this.settings.get('shipping.eta');
    return { min: eta.productionMin, max: eta.productionMax };
  }

  /** Delivery options for a city, cheapest first. Empty when no zone covers the city. */
  async options(input: { cityCode: string; weightG: number; goodsTotal: number; freeShipping: boolean; madeToMeasure: boolean }): Promise<ShippingOption[]> {
    return shippingOptions({
      zones: await this.activeZones(),
      cityCode: input.cityCode,
      weightG: input.weightG,
      goodsTotal: input.goodsTotal,
      freeShipping: input.freeShipping,
      productionDays: await this.productionDays(input.madeToMeasure),
    });
  }

  /** Fastest available delivery window for the product page estimate. */
  async estimate(cityCode: string, madeToMeasure: boolean): Promise<{ minDays: number; maxDays: number } | null> {
    const zone = zoneForCity(await this.activeZones(), cityCode);
    if (!zone || zone.rates.length === 0) return null;
    const production = await this.productionDays(madeToMeasure);
    const minDays = Math.min(...zone.rates.map((r) => r.etaMinDays)) + (production?.min ?? 0);
    const maxDays = Math.min(...zone.rates.map((r) => r.etaMaxDays)) + (production?.max ?? 0);
    return { minDays, maxDays };
  }

  // ───── Admin ─────

  listZones() {
    return this.prisma.shippingZone.findMany({ include: ZONE_INCLUDE, orderBy: { sortOrder: 'asc' } });
  }

  async createZone(dto: ShippingZoneDto) {
    await this.assertCities(dto.cityCodes);
    return this.prisma.$transaction(async (tx) => {
      await this.releaseCities(tx, dto.cityCodes);
      return tx.shippingZone.create({
        data: { code: dto.code.toUpperCase(), nameAr: dto.nameAr, nameEn: dto.nameEn, isActive: dto.isActive ?? true, sortOrder: dto.sortOrder ?? 0, cities: { create: dto.cityCodes.map((cityCode) => ({ cityCode })) } },
        include: ZONE_INCLUDE,
      });
    });
  }

  async updateZone(id: string, dto: UpdateShippingZoneDto) {
    await this.zone(id);
    if (dto.cityCodes) await this.assertCities(dto.cityCodes);
    return this.prisma.$transaction(async (tx) => {
      if (dto.cityCodes) {
        await tx.shippingZoneCity.deleteMany({ where: { zoneId: id } });
        await this.releaseCities(tx, dto.cityCodes);
        await tx.shippingZoneCity.createMany({ data: dto.cityCodes.map((cityCode) => ({ zoneId: id, cityCode })) });
      }
      return tx.shippingZone.update({
        where: { id },
        data: { code: dto.code?.toUpperCase(), nameAr: dto.nameAr, nameEn: dto.nameEn, isActive: dto.isActive, sortOrder: dto.sortOrder },
        include: ZONE_INCLUDE,
      });
    });
  }

  async deleteZone(id: string) {
    await this.zone(id);
    await this.prisma.shippingZone.delete({ where: { id } });
  }

  async createRate(zoneId: string, dto: ShippingRateDto) {
    await this.zone(zoneId);
    this.assertRate(dto);
    return this.prisma.shippingRate.create({ data: { ...dto, carrier: dto.carrier.toUpperCase(), method: dto.method.toUpperCase(), zoneId } });
  }

  async updateRate(id: string, dto: UpdateShippingRateDto) {
    const existing = await this.prisma.shippingRate.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound({ entity: 'shippingRate' });
    this.assertRate({ ...existing, ...dto });
    return this.prisma.shippingRate.update({ where: { id }, data: { ...dto, carrier: dto.carrier?.toUpperCase(), method: dto.method?.toUpperCase() } });
  }

  async deleteRate(id: string) {
    const existing = await this.prisma.shippingRate.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound({ entity: 'shippingRate' });
    await this.prisma.shippingRate.delete({ where: { id } });
  }

  private async zone(id: string) {
    const zone = await this.prisma.shippingZone.findUnique({ where: { id } });
    if (!zone) throw AppError.notFound({ entity: 'shippingZone' });
    return zone;
  }

  /** A city moves to the zone it was last assigned to. */
  private releaseCities(tx: Prisma.TransactionClient, cityCodes: string[]) {
    return tx.shippingZoneCity.deleteMany({ where: { cityCode: { in: cityCodes } } });
  }

  private async assertCities(cityCodes: string[]) {
    const real = cityCodes.filter((c) => c !== '*');
    const found = await this.prisma.city.count({ where: { code: { in: real } } });
    if (found !== new Set(real).size) throw AppError.badRequest('validation', { field: 'cityCodes' });
  }

  private assertRate(r: { minWeightG?: number; maxWeightG?: number | null; etaMinDays: number; etaMaxDays: number }) {
    if (r.maxWeightG != null && r.maxWeightG < (r.minWeightG ?? 0)) throw AppError.badRequest('validation', { field: 'maxWeightG' });
    if (r.etaMaxDays < r.etaMinDays) throw AppError.badRequest('validation', { field: 'etaMaxDays' });
  }
}

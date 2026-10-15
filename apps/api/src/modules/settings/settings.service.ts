import { Injectable } from '@nestjs/common';
import { SA_STANDARD_VAT_BP } from '@hudhud/domain';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Typed store settings with defaults. Values live in the `settings` table and are edited from
 * the admin dashboard; defaults apply until a value is saved (see docs/planning/04-assumptions.md).
 */
export const SETTING_DEFAULTS = {
  'store.name': { ar: 'هدهد', en: 'HUDHUD' },
  'store.legal': {
    commercialRegistration: '',
    vatNumber: '',
    legalNameAr: '',
    legalNameEn: '',
    /** National address of the seller, printed on tax invoices. */
    street: '',
    buildingNumber: '',
    district: '',
    city: '',
    postalCode: '',
  },
  'store.contact': { phone: '', whatsapp: '', email: '' },
  'tax.vat': { rateBp: SA_STANDARD_VAT_BP, pricesIncludeVat: true },
  'cart.giftWrap': { priceHalalas: 1500 },
  'cart.limits': { maxLines: 50, maxQuantityPerLine: 20 },
  /** Delivery estimate (days) by region until shipping zones arrive; made-to-measure adds production time. */
  'shipping.eta': { riyadhMin: 1, riyadhMax: 2, mainMin: 2, mainMax: 3, otherMin: 3, otherMax: 5, productionMin: 7, productionMax: 12 },
  /** Cash on delivery: flat fee, maximum order total, and whether made-to-measure items may use it. */
  'checkout.cod': { enabled: true, feeHalalas: 1500, maxTotalHalalas: 500000, allowMadeToMeasure: false },
  /** Store pickup from branches flagged as pickup points; ready time covers the transfer from the warehouse. */
  'checkout.pickup': { enabled: true, readyMinDays: 1, readyMaxDays: 3 },
  /** Unpaid card/BNPL orders hold their stock this long before they are cancelled. */
  'checkout.payment': { unpaidTtlMinutes: 30 },
  /** Payment methods offered at checkout (each also needs its gateway configured). */
  'payments.methods': { card: true, tabby: true, tamara: true, cod: true },
  /** Buy-now-pay-later order limits (halalas). */
  'payments.bnpl': { minTotalHalalas: 10000, maxTotalHalalas: 500000 },
  'modules.enabled': {
    loyalty: false,
    fabricSamples: true,
    motorizedCurtains: true,
    giftWrapping: true,
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K] extends infer T
  ? { -readonly [P in keyof T]: T[P] extends string ? string : T[P] extends boolean ? boolean : T[P] extends number ? number : T[P] }
  : never;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return { ...SETTING_DEFAULTS[key], ...((row?.value as object | undefined) ?? {}) } as unknown as SettingValue<K>;
  }

  async set<K extends SettingKey>(key: K, value: Partial<SettingValue<K>>, actorId?: string): Promise<SettingValue<K>> {
    const merged = { ...(await this.get(key)), ...value };
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: merged as Prisma.InputJsonValue, updatedBy: actorId },
      update: { value: merged as Prisma.InputJsonValue, updatedBy: actorId },
    });
    return merged;
  }

  async publicStoreInfo() {
    const [name, legal, contact, vat, modules] = await Promise.all([
      this.get('store.name'),
      this.get('store.legal'),
      this.get('store.contact'),
      this.get('tax.vat'),
      this.get('modules.enabled'),
    ]);
    return { name, legal, contact, vat, modules };
  }
}

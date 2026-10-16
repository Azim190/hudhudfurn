import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfiguratorError, quoteConfiguration, validateTemplate, type ConfigurationInputs, type Quote, type TemplateDef } from '@hudhud/domain';
import { Prisma, type ConfiguratorOption, type ConfiguratorTemplate, type HeadingStyle, type SavedConfiguration } from '@prisma/client';
import sharp from 'sharp';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MALWARE_SCANNER, PRIVATE_STORAGE, type MalwareScanner, type StoragePort } from '../storage/storage.port';
import type {
  HeadingStyleDto,
  MeasurementProfileDto,
  OptionDto,
  TemplateDto,
  UpdateHeadingStyleDto,
  UpdateMeasurementProfileDto,
  UpdateOptionDto,
  UpdateTemplateDto,
} from './configurator.dto';

type TemplateFull = ConfiguratorTemplate & { headingStyles: HeadingStyle[]; options: ConfiguratorOption[] };

const FULL = {
  headingStyles: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
  options: { where: { isActive: true }, orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }] },
} satisfies Prisma.ConfiguratorTemplateInclude;

const ADMIN_FULL = {
  headingStyles: { orderBy: { sortOrder: 'asc' } },
  options: { orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }] },
  _count: { select: { products: true } },
} satisfies Prisma.ConfiguratorTemplateInclude;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PROFILES = 10;
const UNATTACHED_UPLOAD_TTL_MS = 24 * 3_600_000;
const MEASUREMENT_KEYS = ['length', 'chest', 'shoulder', 'sleeve'];

/** Convert a stored template into the domain definition (fullness is stored in hundredths). */
export function toTemplateDef(t: TemplateFull): TemplateDef {
  return {
    kind: t.kind,
    version: t.version,
    constants: (t.constants ?? {}) as Record<string, number>,
    formulas: (t.formulas ?? {}) as Record<string, string>,
    headingStyles: t.headingStyles.map((h) => ({ code: h.code, nameAr: h.nameAr, nameEn: h.nameEn, fullnessMin: h.fullnessMin / 100, fullnessMax: h.fullnessMax / 100, fullnessDefault: h.fullnessDefault / 100, makingCostPerM: h.makingCostPerM })),
    options: t.options.map((o) => ({ group: o.group, code: o.code, nameAr: o.nameAr, nameEn: o.nameEn, priceBasis: o.priceBasis, price: o.price, isDefault: o.isDefault })),
  };
}

export interface ConfigurationSnapshot {
  configurationId: string;
  templateCode: string;
  kind: string;
  templateVersion: number;
  inputs: ConfigurationInputs;
  specs: Quote['specs'];
  choices: Quote['choices'];
  lines: Quote['lines'];
}

@Injectable()
export class ConfiguratorService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRIVATE_STORAGE) private readonly storage: StoragePort,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  // ───── Storefront ─────

  private async liveProduct(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: 'ACTIVE', deletedAt: null },
      include: {
        configuratorTemplate: { include: FULL },
        variants: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { options: { include: { value: { include: { attribute: true } } } } } },
      },
    });
    if (!product || !product.configuratorTemplate?.isActive) throw AppError.notFound({ entity: 'configurator' });
    return product as typeof product & { configuratorTemplate: TemplateFull };
  }

  /** Everything the product page needs to render the configurator. */
  async forProduct(productId: string) {
    const product = await this.liveProduct(productId);
    const t = product.configuratorTemplate;
    const def = toTemplateDef(t);
    return {
      template: {
        id: t.id,
        code: t.code,
        kind: t.kind,
        nameAr: t.nameAr,
        nameEn: t.nameEn,
        version: t.version,
        constants: def.constants,
        headingStyles: def.headingStyles,
        options: t.options.map((o) => ({ group: o.group, code: o.code, nameAr: o.nameAr, nameEn: o.nameEn, descriptionAr: o.descriptionAr, descriptionEn: o.descriptionEn, priceBasis: o.priceBasis, price: o.price, isDefault: o.isDefault })),
      },
      product: { id: product.id, pricingMode: product.pricingMode, basePrice: product.basePrice },
      variants: product.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        price: v.price ?? product.basePrice,
        fabricWidthMm: v.fabricWidthMm,
        options: v.options.map((o) => ({ attributeKey: o.value.attribute.key, code: o.value.code, labelAr: o.value.labelAr, labelEn: o.value.labelEn, swatchHex: o.value.swatchHex })),
      })),
    };
  }

  /** Price inputs for a product variant (stateless; called on every change in the configurator). */
  async quote(productId: string, variantId: string, inputs: ConfigurationInputs): Promise<Quote> {
    const product = await this.liveProduct(productId);
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant) throw AppError.badRequest('validation', { field: 'variantId' });
    return quoteConfiguration(toTemplateDef(product.configuratorTemplate), inputs, { basePrice: variant.price ?? product.basePrice, fabricWidthMm: variant.fabricWidthMm });
  }

  /** Save a valid configuration (used when it is added to the cart). Attaches the customer's photos. */
  async create(productId: string, variantId: string, inputs: ConfigurationInputs, userId?: string): Promise<SavedConfiguration> {
    const product = await this.liveProduct(productId);
    const quote = await this.quote(productId, variantId, inputs);
    if (!quote.valid) throw AppError.badRequest('configurationInvalid', { issues: quote.issues.map((i) => `${i.field}:${i.code}`).join(',') });
    const photoIds = [...new Set(inputs.photoIds ?? [])];
    return this.prisma.$transaction(async (tx) => {
      if (photoIds.length) {
        const fresh = new Date(Date.now() - UNATTACHED_UPLOAD_TTL_MS);
        const uploads = await tx.customerUpload.findMany({ where: { id: { in: photoIds }, configurationId: null, createdAt: { gte: fresh } } });
        if (uploads.length !== photoIds.length) throw AppError.badRequest('validation', { field: 'inputs.photoIds' });
      }
      const saved = await tx.savedConfiguration.create({
        data: {
          templateId: product.configuratorTemplate.id,
          templateVersion: product.configuratorTemplate.version,
          productId,
          variantId,
          userId,
          inputs: { ...inputs, photoIds } as unknown as Prisma.InputJsonValue,
          computed: { lines: quote.lines, specs: quote.specs, choices: quote.choices } as unknown as Prisma.InputJsonValue,
          total: quote.total,
        },
      });
      if (photoIds.length) await tx.customerUpload.updateMany({ where: { id: { in: photoIds } }, data: { configurationId: saved.id } });
      return saved;
    });
  }

  /**
   * Re-price saved configurations with the current templates and fabric prices (cart views and
   * checkout). Returns null for a configuration that no longer quotes (template changed or retired).
   */
  async requote(configurations: SavedConfiguration[]): Promise<Map<string, Quote | null>> {
    const out = new Map<string, Quote | null>();
    if (configurations.length === 0) return out;
    const templates = await this.prisma.configuratorTemplate.findMany({ where: { id: { in: [...new Set(configurations.map((c) => c.templateId))] } }, include: FULL });
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: configurations.map((c) => c.variantId) } }, include: { product: { select: { basePrice: true } } } });
    for (const c of configurations) {
      const t = templates.find((x) => x.id === c.templateId);
      const v = variants.find((x) => x.id === c.variantId);
      if (!t?.isActive || !v?.isActive) {
        out.set(c.id, null);
        continue;
      }
      const q = quoteConfiguration(toTemplateDef(t), c.inputs as ConfigurationInputs, { basePrice: v.price ?? v.product.basePrice, fabricWidthMm: v.fabricWidthMm });
      out.set(c.id, q.valid ? q : null);
    }
    return out;
  }

  /** What the order line keeps for the workshop. */
  async snapshot(c: SavedConfiguration, quote: Quote): Promise<ConfigurationSnapshot> {
    const t = await this.prisma.configuratorTemplate.findUniqueOrThrow({ where: { id: c.templateId }, select: { code: true, kind: true } });
    return { configurationId: c.id, templateCode: t.code, kind: t.kind, templateVersion: Number(quote.specs.templateVersion ?? c.templateVersion), inputs: c.inputs as ConfigurationInputs, specs: quote.specs, choices: quote.choices, lines: quote.lines };
  }

  /** Snapshot from the stored (locked) quote of a configuration, e.g. for an accepted quotation. */
  async snapshotFromSaved(c: SavedConfiguration): Promise<ConfigurationSnapshot> {
    const computed = c.computed as { lines?: Quote['lines']; specs?: Quote['specs']; choices?: Quote['choices'] };
    return this.snapshot(c, { valid: true, issues: [], total: c.total, lines: computed.lines ?? [], specs: computed.specs ?? {}, choices: computed.choices ?? [] });
  }

  // ───── Customer uploads (private) ─────

  /** Validate by decoding, auto-rotate, strip metadata (incl. GPS), cap size, store privately. */
  async upload(file: { buffer: Buffer; originalname: string; size: number } | undefined, userId?: string) {
    if (!file) throw AppError.badRequest('validation', { field: 'file' });
    if (file.size > MAX_UPLOAD_BYTES) throw AppError.badRequest('validation', { field: 'file', reason: 'tooLarge', maxMb: 10 });
    let image: { data: Buffer; info: sharp.OutputInfo };
    try {
      image = await sharp(file.buffer, { limitInputPixels: 50_000_000 }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
    } catch {
      throw AppError.badRequest('validation', { field: 'file', reason: 'notAnImage' });
    }
    const scan = await this.scanner.scan(image.data, file.originalname);
    if (!scan.clean) throw AppError.badRequest('validation', { field: 'file', reason: 'rejected' });
    const id = randomUUID();
    const storageKey = `customer-uploads/${new Date().toISOString().slice(0, 7)}/${id}.jpg`;
    await this.storage.put({ key: storageKey, body: image.data, contentType: 'image/jpeg' });
    const row = await this.prisma.customerUpload.create({ data: { id, storageKey, contentType: 'image/jpeg', width: image.info.width, height: image.info.height, bytes: image.data.length, userId } });
    return { id: row.id, width: row.width, height: row.height };
  }

  async uploadContent(id: string) {
    const row = await this.prisma.customerUpload.findUnique({ where: { id } });
    if (!row) throw AppError.notFound({ entity: 'upload' });
    return { body: await this.storage.get(row.storageKey), contentType: row.contentType };
  }

  /** Remove photos that were never attached to a configuration. */
  async purgeStaleUploads(): Promise<number> {
    const stale = await this.prisma.customerUpload.findMany({ where: { configurationId: null, createdAt: { lt: new Date(Date.now() - UNATTACHED_UPLOAD_TTL_MS) } }, take: 500 });
    if (stale.length === 0) return 0;
    await this.storage.delete(stale.map((s) => s.storageKey));
    await this.prisma.customerUpload.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    return stale.length;
  }

  // ───── Measurement profiles ─────

  listProfiles(userId: string) {
    return this.prisma.measurementProfile.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
  }

  async createProfile(userId: string, dto: MeasurementProfileDto) {
    if ((await this.prisma.measurementProfile.count({ where: { userId } })) >= MAX_PROFILES) throw AppError.badRequest('validation', { reason: 'tooManyProfiles', max: MAX_PROFILES });
    return this.prisma.measurementProfile.create({ data: { userId, label: dto.label.trim(), measurements: this.measurements(dto.measurements), notes: dto.notes?.trim() || null } });
  }

  async updateProfile(userId: string, id: string, dto: UpdateMeasurementProfileDto) {
    await this.ownedProfile(userId, id);
    return this.prisma.measurementProfile.update({
      where: { id },
      data: { label: dto.label?.trim(), measurements: dto.measurements ? this.measurements(dto.measurements) : undefined, notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined },
    });
  }

  async deleteProfile(userId: string, id: string) {
    await this.ownedProfile(userId, id);
    await this.prisma.measurementProfile.delete({ where: { id } });
  }

  private async ownedProfile(userId: string, id: string) {
    const p = await this.prisma.measurementProfile.findFirst({ where: { id, userId } });
    if (!p) throw AppError.notFound({ entity: 'measurementProfile' });
    return p;
  }

  private measurements(m: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const key of MEASUREMENT_KEYS) {
      const v = m[key];
      if (v === undefined) continue;
      if (!Number.isInteger(v) || v < 100 || v > 3000) throw AppError.badRequest('validation', { field: `measurements.${key}` });
      out[key] = v;
    }
    if (Object.keys(m).some((k) => !MEASUREMENT_KEYS.includes(k))) throw AppError.badRequest('validation', { field: 'measurements' });
    return out;
  }

  // ───── Admin ─────

  listTemplates() {
    return this.prisma.configuratorTemplate.findMany({ include: ADMIN_FULL, orderBy: { code: 'asc' } });
  }

  async getTemplate(id: string) {
    const t = await this.prisma.configuratorTemplate.findUnique({ where: { id }, include: ADMIN_FULL });
    if (!t) throw AppError.notFound({ entity: 'configuratorTemplate' });
    return t;
  }

  async createTemplate(dto: TemplateDto) {
    this.check({ kind: dto.kind, version: 1, constants: dto.constants ?? {}, formulas: dto.formulas ?? {}, headingStyles: [], options: [] });
    try {
      const t = await this.prisma.configuratorTemplate.create({
        data: { code: dto.code, kind: dto.kind, nameAr: dto.nameAr, nameEn: dto.nameEn, constants: dto.constants ?? {}, formulas: dto.formulas ?? {}, isActive: dto.isActive ?? true },
      });
      return this.getTemplate(t.id);
    } catch (err) {
      throw this.conflict(err);
    }
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto) {
    const current = await this.getTemplate(id);
    if (dto.kind && dto.kind !== current.kind && current._count.products > 0) throw AppError.badRequest('validation', { field: 'kind', reason: 'inUse' });
    const next = { ...toTemplateDef(current), kind: dto.kind ?? current.kind, constants: dto.constants ?? (current.constants as Record<string, number>), formulas: dto.formulas ?? (current.formulas as Record<string, string>) };
    this.check(next);
    try {
      await this.prisma.configuratorTemplate.update({
        where: { id },
        data: { code: dto.code, kind: dto.kind, nameAr: dto.nameAr, nameEn: dto.nameEn, constants: dto.constants, formulas: dto.formulas, isActive: dto.isActive, version: { increment: 1 } },
      });
    } catch (err) {
      throw this.conflict(err);
    }
    return this.getTemplate(id);
  }

  async addHeadingStyle(templateId: string, dto: HeadingStyleDto) {
    const t = await this.getTemplate(templateId);
    this.check({ ...toTemplateDef(t), headingStyles: [this.headingDef(dto)] });
    return this.bump(templateId, () => this.prisma.headingStyle.create({ data: { ...dto, templateId } }));
  }

  async updateHeadingStyle(id: string, dto: UpdateHeadingStyleDto) {
    const h = await this.prisma.headingStyle.findUnique({ where: { id } });
    if (!h) throw AppError.notFound({ entity: 'headingStyle' });
    const t = await this.getTemplate(h.templateId);
    this.check({ ...toTemplateDef(t), headingStyles: [this.headingDef({ ...h, ...dto })] });
    return this.bump(h.templateId, () => this.prisma.headingStyle.update({ where: { id }, data: dto }));
  }

  async addOption(templateId: string, dto: OptionDto) {
    const t = await this.getTemplate(templateId);
    this.check({ ...toTemplateDef(t), options: [{ ...dto, isDefault: dto.isDefault }] });
    return this.bump(templateId, async () => {
      if (dto.isDefault) await this.prisma.configuratorOption.updateMany({ where: { templateId, group: dto.group }, data: { isDefault: false } });
      return this.prisma.configuratorOption.create({ data: { ...dto, templateId } });
    });
  }

  async updateOption(id: string, dto: UpdateOptionDto) {
    const o = await this.prisma.configuratorOption.findUnique({ where: { id } });
    if (!o) throw AppError.notFound({ entity: 'configuratorOption' });
    const t = await this.getTemplate(o.templateId);
    this.check({ ...toTemplateDef(t), options: [{ ...o, ...dto }] });
    return this.bump(o.templateId, async () => {
      if (dto.isDefault) await this.prisma.configuratorOption.updateMany({ where: { templateId: o.templateId, group: dto.group ?? o.group, id: { not: id } }, data: { isDefault: false } });
      return this.prisma.configuratorOption.update({ where: { id }, data: dto });
    });
  }

  /** Price sample inputs against the template as it is now (admin "simulate"). */
  async simulate(templateId: string, inputs: ConfigurationInputs, basePrice: number, fabricWidthMm?: number) {
    const t = await this.prisma.configuratorTemplate.findUnique({ where: { id: templateId }, include: FULL });
    if (!t) throw AppError.notFound({ entity: 'configuratorTemplate' });
    return quoteConfiguration(toTemplateDef(t), inputs, { basePrice, fabricWidthMm });
  }


  private headingDef(h: { code: string; nameAr: string; nameEn: string; fullnessMin: number; fullnessMax: number; fullnessDefault: number; makingCostPerM: number }) {
    return { code: h.code, nameAr: h.nameAr, nameEn: h.nameEn, fullnessMin: h.fullnessMin / 100, fullnessMax: h.fullnessMax / 100, fullnessDefault: h.fullnessDefault / 100, makingCostPerM: h.makingCostPerM };
  }

  private check(def: TemplateDef) {
    try {
      validateTemplate(def);
    } catch (err) {
      if (err instanceof ConfiguratorError) throw AppError.badRequest('validation', { reason: err.message });
      throw err;
    }
  }

  /** Every rule change bumps the template version. */
  private async bump<T>(templateId: string, fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      await this.prisma.configuratorTemplate.update({ where: { id: templateId }, data: { version: { increment: 1 } } });
      return result;
    } catch (err) {
      throw this.conflict(err);
    }
  }

  private conflict(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return AppError.conflict('conflict', { field: 'code' });
    return err;
  }
}

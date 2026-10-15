import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { combinationKey, fromSar, toSar } from '@hudhud/domain';
import { Prisma, type PricingMode, type ProductStatus } from '@prisma/client';
import type { Job, Queue } from 'bullmq';
import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { QUEUES } from '../../core/queue/queue.module';
import { SearchSync } from '../search/search-sync';
import { STORAGE, type StoragePort } from '../storage/storage.port';
import { PRODUCT_FULL_INCLUDE } from './catalog.presenter';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';

/** One row per variant. Product columns repeat on each row of the same product. */
export const IMPORT_COLUMNS = [
  'sku_prefix',
  'category_slug',
  'name_ar',
  'name_en',
  'description_ar',
  'description_en',
  'care_ar',
  'care_en',
  'pricing_mode',
  'base_price_sar',
  'compare_at_sar',
  'status',
  'made_to_measure',
  'product_attributes',
  'variant_sku',
  'variant_options',
  'variant_price_sar',
  'variant_compare_at_sar',
  'stock',
  'location_code',
] as const;

type Column = (typeof IMPORT_COLUMNS)[number];
type Row = Record<Column, string> & { __row: number };

export interface ImportSummary {
  products: { created: number; updated: number; failed: number };
  variants: number;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
}

const MAX_ROWS = 20_000;
const MAX_ERRORS = 500;

class RowError extends Error {
  constructor(
    readonly row: number,
    message: string,
  ) {
    super(message);
  }
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value) return String(value.text);
    if ('result' in value) return String(value.result ?? '');
    if (value instanceof Date) return value.toISOString();
  }
  return String(value).trim();
}

/** "fabric=crepe;occasion=daily,work" → [{key:'fabric',codes:['crepe']}, ...] */
export function parsePairs(text: string): Array<{ key: string; codes: string[] }> {
  if (!text.trim()) return [];
  return text.split(';').map((part) => {
    const [key, codes] = part.split('=').map((s) => s?.trim() ?? '');
    if (!key || !codes) throw new Error(`Malformed pair "${part}" (expected key=code)`);
    return { key, codes: codes.split(',').map((c) => c.trim()).filter(Boolean) };
  });
}

const sar = (text: string, row: number, field: string): number | null => {
  if (!text) return null;
  const n = Number(text.replace(/[,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new RowError(row, `${field} must be a positive number`);
  return fromSar(n);
};

@Injectable()
export class ImportExportService {
  private readonly logger = new Logger(ImportExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductService,
    private readonly categories: CategoryService,
    private readonly sync: SearchSync,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @InjectQueue(QUEUES.catalogImport) private readonly queue: Queue,
  ) {}

  async enqueueImport(file: { buffer: Buffer; originalname: string }, actorId: string) {
    const ext = file.originalname.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
    if (!file?.buffer?.length) throw AppError.badRequest('validation', { field: 'file' });
    // Fail fast on unreadable files before queuing.
    await this.parse(file.buffer, ext);
    const job = await this.prisma.backgroundJob.create({ data: { kind: 'PRODUCT_IMPORT', createdById: actorId } });
    const inputKey = `imports/${job.id}.${ext}`;
    await this.storage.put({ key: inputKey, body: file.buffer, contentType: ext === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await this.prisma.backgroundJob.update({ where: { id: job.id }, data: { inputKey } });
    await this.queue.add('import', { jobId: job.id }, { jobId: `import-${job.id}`, attempts: 1 });
    return this.prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
  }

  async getJob(id: string) {
    const job = await this.prisma.backgroundJob.findUnique({ where: { id } });
    if (!job) throw AppError.notFound();
    return job;
  }

  async runImport(jobId: string): Promise<ImportSummary> {
    const job = await this.prisma.backgroundJob.update({ where: { id: jobId }, data: { status: 'RUNNING' } });
    try {
      const ext = job.inputKey!.endsWith('.csv') ? 'csv' : 'xlsx';
      const rows = await this.parse(await this.storage.get(job.inputKey!), ext);
      const summary = await this.importRows(rows);
      await this.prisma.backgroundJob.update({
        where: { id: jobId },
        data: { status: summary.products.failed ? 'FAILED' : 'SUCCEEDED', summary: summary as unknown as Prisma.InputJsonValue, finishedAt: new Date() },
      });
      return summary;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.backgroundJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', summary: { errors: [{ row: 0, message }] }, finishedAt: new Date() },
      });
      throw err;
    }
  }

  async importRows(rows: Row[]): Promise<ImportSummary> {
    const summary: ImportSummary = { products: { created: 0, updated: 0, failed: 0 }, variants: 0, errors: [], warnings: [] };
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const key = row.sku_prefix.toUpperCase();
      if (!key) {
        summary.errors.push({ row: row.__row, message: 'sku_prefix is required' });
        continue;
      }
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const [categories, attributes, locations] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, slugAr: true, slugEn: true } }),
      this.prisma.attribute.findMany({ include: { values: true } }),
      this.prisma.location.findMany(),
    ]);
    const valueIndex = new Map<string, string>(attributes.flatMap((a) => a.values.map((v) => [`${a.key}:${v.code}`, v.id] as [string, string])));
    const touched: string[] = [];

    for (const [skuPrefix, group] of groups) {
      try {
        const id = await this.importProduct(skuPrefix, group, { categories, valueIndex, locations }, summary);
        touched.push(id);
      } catch (err) {
        summary.products.failed++;
        const row = err instanceof RowError ? err.row : group[0]!.__row;
        if (summary.errors.length < MAX_ERRORS) summary.errors.push({ row, message: err instanceof Error ? err.message : String(err) });
      }
    }
    await this.sync.products(touched);
    return summary;
  }

  private async importProduct(
    skuPrefix: string,
    rows: Row[],
    ctx: { categories: Array<{ id: string; slugAr: string; slugEn: string }>; valueIndex: Map<string, string>; locations: Array<{ id: string; code: string }> },
    summary: ImportSummary,
  ): Promise<string> {
    const head = rows[0]!;
    const category = ctx.categories.find((c) => c.slugEn === head.category_slug || c.slugAr === head.category_slug);
    if (!category) throw new RowError(head.__row, `Unknown category_slug "${head.category_slug}"`);
    if (!head.name_ar) throw new RowError(head.__row, 'name_ar is required');
    const pricingMode = (head.pricing_mode || 'FIXED').toUpperCase() as PricingMode;
    if (!['FIXED', 'PER_METER', 'PER_SQM', 'CALCULATED'].includes(pricingMode)) throw new RowError(head.__row, `Invalid pricing_mode ${head.pricing_mode}`);
    const basePrice = sar(head.base_price_sar, head.__row, 'base_price_sar');
    if (basePrice === null) throw new RowError(head.__row, 'base_price_sar is required');

    const resolve = (pairs: Array<{ key: string; codes: string[] }>, row: number) =>
      pairs.flatMap(({ key, codes }) =>
        codes.map((code) => {
          const id = ctx.valueIndex.get(`${key}:${code}`);
          if (!id) throw new RowError(row, `Unknown attribute value ${key}=${code}`);
          return { key, code, id };
        }),
      );
    let productValues: Array<{ id: string }>;
    try {
      productValues = resolve(parsePairs(head.product_attributes), head.__row);
    } catch (err) {
      throw err instanceof RowError ? err : new RowError(head.__row, (err as Error).message);
    }

    const fields = {
      categoryId: category.id,
      nameAr: head.name_ar,
      nameEn: head.name_en || null,
      descriptionAr: head.description_ar || null,
      descriptionEn: head.description_en || null,
      careAr: head.care_ar || null,
      careEn: head.care_en || null,
      pricingMode,
      basePrice,
      compareAtPrice: sar(head.compare_at_sar, head.__row, 'compare_at_sar'),
      isMadeToMeasure: ['1', 'true', 'yes', 'نعم'].includes(head.made_to_measure.toLowerCase()),
    };

    // Validate every variant row before writing anything, so a bad row never half-imports a product.
    const prepared = rows.map((row) => {
      let options: Array<{ key: string; code: string; id: string }>;
      try {
        options = resolve(parsePairs(row.variant_options), row.__row);
      } catch (err) {
        throw err instanceof RowError ? err : new RowError(row.__row, (err as Error).message);
      }
      let stock: { qty: number; locationId: string } | null = null;
      if (row.stock) {
        const qty = Number(row.stock);
        if (!Number.isInteger(qty) || qty < 0) throw new RowError(row.__row, 'stock must be a non-negative integer');
        const location = ctx.locations.find((l) => l.code === (row.location_code || 'MAIN'));
        if (!location) throw new RowError(row.__row, `Unknown location_code ${row.location_code || 'MAIN'}`);
        stock = { qty, locationId: location.id };
      }
      return {
        options,
        optionKey: combinationKey(options.map((o) => ({ attributeKey: o.key, code: o.code }))),
        sku: (row.variant_sku || [skuPrefix, ...options.map((o) => o.code)].join('-')).toUpperCase(),
        explicitSku: Boolean(row.variant_sku),
        price: sar(row.variant_price_sar, row.__row, 'variant_price_sar'),
        compareAtPrice: sar(row.variant_compare_at_sar, row.__row, 'variant_compare_at_sar'),
        stock,
      };
    });
    if (new Set(prepared.map((p) => p.optionKey)).size !== prepared.length) {
      throw new RowError(head.__row, `${skuPrefix}: duplicate variant_options rows`);
    }

    const existing = await this.prisma.product.findUnique({ where: { skuPrefix } });
    const productId = existing
      ? (await this.products.update(existing.id, { ...fields, nameEn: fields.nameEn ?? undefined, attributeValueIds: productValues.map((v) => v.id) } as never)).id
      : (await this.products.create({ ...fields, skuPrefix, nameEn: fields.nameEn ?? undefined, attributeValueIds: productValues.map((v) => v.id) } as never)).id;
    if (existing) summary.products.updated++;
    else summary.products.created++;

    await this.prisma.$transaction(async (tx) => {
      for (const p of prepared) {
        const data = { price: p.price, compareAtPrice: p.compareAtPrice, isActive: true };
        const variant = await tx.productVariant.upsert({
          where: { productId_optionKey: { productId, optionKey: p.optionKey } },
          create: { productId, optionKey: p.optionKey, sku: p.sku, ...data, options: { create: p.options.map((o) => ({ attributeValueId: o.id })) } },
          update: { ...data, ...(p.explicitSku ? { sku: p.sku } : {}) },
        });
        summary.variants++;
        if (p.optionKey !== '') {
          // A real matrix replaces the auto-created default variant.
          await tx.productVariant.updateMany({ where: { productId, optionKey: '' }, data: { isActive: false, isDefault: false } });
        }
        if (p.stock) {
          const where = { variantId_locationId: { variantId: variant.id, locationId: p.stock.locationId } };
          const current = await tx.stockLevel.findUnique({ where });
          if (current && p.stock.qty < current.reserved) throw new RowError(head.__row, `${p.sku}: stock below reserved quantity`);
          await tx.stockLevel.upsert({
            where,
            create: { variantId: variant.id, locationId: p.stock.locationId, onHand: p.stock.qty },
            update: { onHand: p.stock.qty },
          });
          const delta = p.stock.qty - (current?.onHand ?? 0);
          if (delta) {
            await tx.stockMovement.create({ data: { variantId: variant.id, locationId: p.stock.locationId, quantity: delta, reason: 'IMPORT' } });
          }
        }
      }
      const actives = await tx.productVariant.findMany({ where: { productId, isActive: true }, orderBy: { sortOrder: 'asc' } });
      if (actives.length && !actives.some((v) => v.isDefault)) await tx.productVariant.update({ where: { id: actives[0]!.id }, data: { isDefault: true } });
    });

    const wanted = (head.status || 'DRAFT').toUpperCase() as ProductStatus;
    if (wanted === 'ACTIVE') {
      try {
        await this.products.publish(productId);
      } catch (err) {
        const missing = err instanceof AppError ? (err.details?.['missing'] as string[] | undefined) : undefined;
        summary.warnings.push({ row: head.__row, message: `${skuPrefix} kept as draft: incomplete (${missing?.join(', ') ?? 'unknown'})` });
      }
    } else if (wanted === 'ARCHIVED' || wanted === 'DRAFT') {
      if (existing && existing.status !== wanted) await this.products.unpublish(productId, wanted);
    }
    return productId;
  }

  async parse(buffer: Buffer, ext: 'csv' | 'xlsx'): Promise<Row[]> {
    const workbook = new ExcelJS.Workbook();
    let sheet: ExcelJS.Worksheet | undefined;
    try {
      if (ext === 'csv') sheet = await workbook.csv.read(Readable.from(buffer));
      else {
        await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
        sheet = workbook.worksheets[0];
      }
    } catch {
      throw AppError.badRequest('validation', { field: 'file', reason: 'unreadable' });
    }
    if (!sheet) throw AppError.badRequest('validation', { field: 'file', reason: 'empty' });
    const header = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((v) => cellText(v).toLowerCase().replace(/^﻿/, ''));
    const missing = ['sku_prefix', 'category_slug', 'name_ar', 'base_price_sar'].filter((c) => !header.includes(c));
    if (missing.length) throw AppError.badRequest('validation', { field: 'file', reason: 'missingColumns', missing });
    if (sheet.rowCount - 1 > MAX_ROWS) throw AppError.badRequest('validation', { field: 'file', reason: 'tooManyRows', max: MAX_ROWS });

    const rows: Row[] = [];
    sheet.eachRow((row, n) => {
      if (n === 1) return;
      const values = (row.values as ExcelJS.CellValue[]).slice(1);
      const record = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, ''])) as Record<Column, string>;
      header.forEach((h, i) => {
        if ((IMPORT_COLUMNS as readonly string[]).includes(h)) record[h as Column] = cellText(values[i] ?? null);
      });
      if (Object.values(record).some(Boolean)) rows.push({ ...record, __row: n });
    });
    return rows;
  }

  async export(format: 'xlsx' | 'csv'): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('products', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = IMPORT_COLUMNS.map((c) => ({ header: c, key: c, width: c.includes('description') ? 50 : 18 }));
    sheet.getRow(1).font = { bold: true };

    const categories = new Map((await this.prisma.category.findMany({ select: { id: true, slugEn: true } })).map((c) => [c.id, c.slugEn]));
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.product.findMany({
        where: { deletedAt: null },
        include: { ...PRODUCT_FULL_INCLUDE, variants: { ...PRODUCT_FULL_INCLUDE.variants, include: { ...PRODUCT_FULL_INCLUDE.variants.include, stock: { include: { location: true } } } } },
        orderBy: { id: 'asc' },
        take: 200,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      for (const p of batch) {
        const productAttributes = groupPairs(p.attributes.map((a) => [a.value.attribute.key, a.value.code]));
        for (const v of p.variants.filter((x) => x.isActive)) {
          const stock = v.stock[0];
          sheet.addRow({
            sku_prefix: p.skuPrefix,
            category_slug: categories.get(p.categoryId),
            name_ar: p.nameAr,
            name_en: p.nameEn ?? '',
            description_ar: p.descriptionAr ?? '',
            description_en: p.descriptionEn ?? '',
            care_ar: p.careAr ?? '',
            care_en: p.careEn ?? '',
            pricing_mode: p.pricingMode,
            base_price_sar: toSar(p.basePrice),
            compare_at_sar: p.compareAtPrice === null ? '' : toSar(p.compareAtPrice),
            status: p.status,
            made_to_measure: p.isMadeToMeasure ? 'true' : 'false',
            product_attributes: productAttributes,
            variant_sku: v.sku,
            variant_options: groupPairs(v.options.map((o) => [o.value.attribute.key, o.value.code])),
            variant_price_sar: v.price === null ? '' : toSar(v.price),
            variant_compare_at_sar: v.compareAtPrice === null ? '' : toSar(v.compareAtPrice),
            stock: stock ? stock.onHand : '',
            location_code: stock?.location.code ?? '',
          });
        }
      }
      cursor = batch[batch.length - 1]!.id;
    }
    if (format === 'csv') {
      // UTF-8 BOM so Excel opens Arabic text correctly.
      return Buffer.concat([Buffer.from('﻿'), Buffer.from(await workbook.csv.writeBuffer())]);
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

function groupPairs(pairs: Array<[string, string]>): string {
  const map = new Map<string, string[]>();
  for (const [k, v] of pairs) map.set(k, [...(map.get(k) ?? []), v]);
  return [...map].map(([k, v]) => `${k}=${v.join(',')}`).join(';');
}

@Processor(QUEUES.catalogImport, { concurrency: 1 })
export class ImportProcessor extends WorkerHost {
  constructor(private readonly service: ImportExportService) {
    super();
  }

  async process(job: Job<{ jobId: string }>) {
    return this.service.runImport(job.data.jobId);
  }
}

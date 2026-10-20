/**
 * Add Hudhud's own content through the real application services: bed-sheet, curtain and sofa-cover
 * products, the home hero banner and the footer social links. Run after seed-catalog; products that
 * already exist (by English name) are skipped.
 *
 *   node --env-file=.env dist/cli/seed-showroom.js
 */
import './disable-workers';
import { getQueueToken } from '@nestjs/bullmq';
import { NestFactory } from '@nestjs/core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Queue } from 'bullmq';
import { AppModule } from '../app.module';
import { PrismaService } from '../core/prisma/prisma.service';
import { QUEUES } from '../core/queue/queue.module';
import { InventoryService } from '../modules/catalog/inventory.service';
import { ProductService } from '../modules/catalog/product.service';
import { StorefrontRevalidator } from '../modules/content/storefront-revalidator';
import { MediaService } from '../modules/media/media.service';
import { SearchService } from '../modules/search/search.service';
import { SettingsService } from '../modules/settings/settings.service';
import { SEED_ATTRIBUTES } from './seed-data/attributes';
import { BED_SHEETS } from './seed-data/bed-sheets';
import { SEED_CATEGORIES } from './seed-data/categories';
import { CURTAINS } from './seed-data/curtains';
import { CARE } from './seed-data/products';
import { SOFA_COVERS } from './seed-data/sofa-covers';

// Same relative path from src/cli and dist/cli.
const ASSET_DIR = resolve(__dirname, '../../seed-assets');
const GROUPS = [BED_SHEETS, CURTAINS, SOFA_COVERS];

const SOCIAL = {
  instagram: 'https://www.instagram.com/hadimohog20/',
  x: 'https://x.com/HadiaAdamajsw',
  facebook: 'https://www.facebook.com/people/%D9%87%D8%AF%D9%87%D8%AF-%D9%84%D9%84%D9%85%D9%81%D8%B1%D9%88%D8%B4%D8%A7%D8%AA-%D9%88%D8%A7%D9%84%D9%85%D9%84%D8%A8%D9%88%D8%B3%D8%A7%D8%AA/100082895784193/',
  tiktok: 'https://www.tiktok.com/@user1025536868865',
  telegram: 'https://t.me/Hdha_hdhd',
};

const HOME_HERO = {
  image: 'home-bedroom.jpg',
  titleAr: 'مفارش وستائر تُفصّل لبيتك',
  titleEn: 'Bedding and curtains made for your home',
  subtitleAr: 'أطقم مفارش بكشكش وستائر بألوان متناسقة، بلمسة يدوية من هدهد',
  subtitleEn: 'Ruffled bedding sets and matching curtains, handmade by Hudhud',
  ctaAr: 'تسوّقي المفارش',
  ctaEn: 'Shop bedding',
  link: '/c/bedding',
  altAr: 'غرفة نوم بطقم مفرش أبيض بكشكش برتقالي وستائر برتقالية متناسقة',
  altEn: 'Bedroom with a white bedspread, orange ruffles and matching orange curtains',
};
const log = (msg: string) => console.log(msg);

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const products = app.get(ProductService);
  const inventory = app.get(InventoryService);
  const media = app.get(MediaService);
  const search = app.get(SearchService);

  const warehouse = await prisma.location.findUnique({ where: { code: 'MAIN' } });
  if (!warehouse) throw new Error('MAIN location missing — run seed:catalog first');

  // Attribute values added after the catalog was first seeded (idempotent).
  for (const a of SEED_ATTRIBUTES) {
    const attr = await prisma.attribute.findUnique({ where: { key: a.key } });
    if (!attr) continue;
    for (const [sortOrder, v] of a.values.entries()) {
      await prisma.attributeValue.upsert({
        where: { attributeId_code: { attributeId: attr.id, code: v.code } },
        create: { attributeId: attr.id, code: v.code, labelAr: v.ar, labelEn: v.en, swatchHex: v.hex, numericValue: v.num, sortOrder },
        update: {},
      });
    }
  }

  for (const group of GROUPS) {
    const category = await prisma.category.findUnique({ where: { slugEn: group.category } });
    if (!category) throw new Error(`Category ${group.category} missing — run seed:catalog first`);
    const vertical = SEED_CATEGORIES.find((c) => c.key === group.category)!.vertical;
    const template = group.madeToMeasure
      ? await prisma.configuratorTemplate.findUniqueOrThrow({ where: { code: group.madeToMeasure.template } })
      : null;

    let created = 0;
    for (const sp of group.products) {
      if (await prisma.product.findFirst({ where: { nameEn: sp.en } })) continue;
      const sizes = Object.entries(sp.sizes ?? {});
      const price = template ? sp.fabricPrice! : Math.min(...sizes.map(([, p]) => p));
      const attributeValues = await prisma.attributeValue.findMany({
        where: { OR: Object.entries(sp.attrs ?? {}).flatMap(([key, codes]) => codes.map((code) => ({ attribute: { key }, code }))) },
      });
      const product = await products.create({
        categoryId: category.id,
        nameAr: sp.ar,
        nameEn: sp.en,
        descriptionAr: sp.descAr,
        descriptionEn: sp.descEn,
        careAr: CARE[vertical]!.ar,
        careEn: CARE[vertical]!.en,
        seoTitleAr: sp.ar.slice(0, 70),
        seoTitleEn: sp.en.slice(0, 70),
        seoDescriptionAr: sp.descAr.slice(0, 160),
        seoDescriptionEn: sp.descEn.slice(0, 160),
        pricingMode: template ? 'PER_SQM' : 'FIXED',
        basePrice: price * 100,
        isMadeToMeasure: Boolean(template),
        sampleAvailable: Boolean(template),
        samplePrice: template ? 0 : undefined,
        photoStyle: 'LIFESTYLE',
        attributeValueIds: sp.attrs ? attributeValues.map((v) => v.id) : [],
      });

      const axes = [{ attributeKey: 'color', valueCodes: Object.keys(sp.colors) }];
      if (group.sizeAxis) axes.push({ attributeKey: group.sizeAxis, valueCodes: sizes.map(([code]) => code) });
      const { product: detail } = await products.generateVariants(product.id, { axes });
      const variants = detail.variants.filter((v) => v.isActive);
      for (const v of variants) {
        const size = v.options.find((o) => o.attributeKey === group.sizeAxis)?.code;
        if (size && sp.sizes![size] !== price) await prisma.productVariant.update({ where: { id: v.id }, data: { price: sp.sizes![size]! * 100 } });
      }

      // Made-to-measure: priced by the configurator, like the linked sample curtains.
      if (template && group.madeToMeasure) {
        await prisma.product.update({ where: { id: product.id }, data: { configuratorTemplateId: template.id, pricingMode: 'CALCULATED' } });
        await prisma.productVariant.updateMany({ where: { productId: product.id }, data: { fabricWidthMm: group.madeToMeasure.fabricWidthMm } });
      }

      const items: Array<{ mediaId: string; variantId?: string }> = [];
      const colorLabels = SEED_ATTRIBUTES.find((a) => a.key === 'color')!.values;
      const multiColor = Object.keys(sp.colors).length > 1;
      for (const [color, files] of Object.entries(sp.colors)) {
        const label = colorLabels.find((v) => v.code === color)!;
        const variant = variants.find((v) => v.options.some((o) => o.attributeKey === 'color' && o.code === color));
        for (const [i, file] of files.entries()) {
          const buffer = await readFile(resolve(ASSET_DIR, group.imageDir, file));
          const asset = await media.upload({ buffer, originalname: `${product.skuPrefix}-${color}-${i + 1}.jpg`, size: buffer.length }, undefined, {
            altAr: multiColor ? `${sp.ar} - ${label.ar}` : sp.ar,
            altEn: multiColor ? `${sp.en} – ${label.en}` : sp.en,
          });
          await media.generateRenditions(asset.id);
          items.push({ mediaId: asset.id, variantId: i === 0 ? variant?.id : undefined });
        }
      }
      await products.setMedia(product.id, { items });

      // Made-to-measure items are produced per order and need no stock.
      if (!template) {
        for (const v of variants) {
          await inventory.setStock(v.id, { locationId: warehouse.id, onHand: 5, note: 'Initial stock (placeholder)' }, undefined, 'INITIAL');
        }
      }

      await products.publish(product.id);
      created++;
      log(`  ✓ ${group.category}: ${sp.en}`);
    }
    log(`✓ ${group.category}: ${created} created, ${group.products.length - created} already present`);
  }

  // Home page: the shop's bedroom photo leads the hero carousel (portrait banners render uncropped).
  const hero = HOME_HERO;
  if (!(await prisma.banner.findFirst({ where: { placement: 'HERO', titleAr: hero.titleAr } }))) {
    const buffer = await readFile(resolve(ASSET_DIR, 'banners', hero.image));
    const image = await media.upload({ buffer, originalname: hero.image, size: buffer.length }, undefined, { altAr: hero.altAr, altEn: hero.altEn });
    await media.generateRenditions(image.id);
    await prisma.banner.updateMany({ where: { placement: 'HERO' }, data: { sortOrder: { increment: 1 } } });
    await prisma.banner.create({
      data: {
        placement: 'HERO',
        sortOrder: 0,
        titleAr: hero.titleAr,
        titleEn: hero.titleEn,
        subtitleAr: hero.subtitleAr,
        subtitleEn: hero.subtitleEn,
        ctaAr: hero.ctaAr,
        ctaEn: hero.ctaEn,
        link: hero.link,
        imageArId: image.id,
        imageEnId: image.id,
      },
    });
    log('✓ home hero banner');
  }

  // Footer social links (the shop's own accounts).
  await app.get(SettingsService).set('store.social', SOCIAL);
  log('✓ social links');

  const { indexed } = await search.reindexAll();
  log(`✓ search index: ${indexed} products`);
  // Writes above bypass the admin API, so tell the storefront to drop its cached pages itself.
  await app.get(StorefrontRevalidator).tags(['catalog', 'content', 'store-info']);

  for (const name of [QUEUES.media, QUEUES.search]) await app.get<Queue>(getQueueToken(name)).drain(true);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

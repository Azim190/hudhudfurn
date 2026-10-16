/**
 * Seed the bilingual sample catalog through the real application services (validation, variant
 * matrix, media pipeline, stock movements, publishing rules, search indexing).
 *
 *   node --env-file=.env dist/cli/seed-catalog.js           # add missing data (idempotent)
 *   node --env-file=.env dist/cli/seed-catalog.js --reset   # wipe the catalog first
 */
import './disable-workers';
import { getQueueToken } from '@nestjs/bullmq';
import { NestFactory } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Queue } from 'bullmq';
import { AppModule } from '../app.module';
import { PrismaService } from '../core/prisma/prisma.service';
import { QUEUES } from '../core/queue/queue.module';
import { CategoryService } from '../modules/catalog/category.service';
import { InventoryService } from '../modules/catalog/inventory.service';
import { MerchandisingService } from '../modules/catalog/merchandising.service';
import { ProductService } from '../modules/catalog/product.service';
import { MediaService } from '../modules/media/media.service';
import { SearchService } from '../modules/search/search.service';
import { SEED_ATTRIBUTES } from './seed-data/attributes';
import { seedConfigurators } from './seed-data/configurator';
import { SEED_CATEGORIES, SEED_SIZE_GUIDES } from './seed-data/categories';
import { renderBannerImage, renderProductImage } from './seed-data/product-image';
import { CARE, SEED_COLLECTIONS, SEED_LOOKS, SEED_PRODUCTS } from './seed-data/products';

const log = (msg: string) => console.log(msg);

async function main() {
  const reset = process.argv.includes('--reset');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const categories = app.get(CategoryService);
  const products = app.get(ProductService);
  const inventory = app.get(InventoryService);
  const merch = app.get(MerchandisingService);
  const media = app.get(MediaService);
  const search = app.get(SearchService);

  if (reset) {
    log('• Resetting catalog data');
    await prisma.$transaction([
      prisma.productRelation.deleteMany(),
      prisma.collectionProduct.deleteMany(),
      prisma.productMedia.deleteMany(),
      prisma.stockMovement.deleteMany(),
      prisma.stockLevel.deleteMany(),
      prisma.variantOptionValue.deleteMany(),
      prisma.productVariant.deleteMany(),
      prisma.productAttributeValue.deleteMany(),
      prisma.product.deleteMany(),
      prisma.categoryAttribute.deleteMany(),
      prisma.category.updateMany({ data: { parentId: null } }),
      prisma.category.deleteMany(),
      prisma.collection.deleteMany(),
      prisma.banner.deleteMany(),
      prisma.mediaAsset.deleteMany(),
    ]);
  }

  // Locations
  const riyadh = await prisma.city.findUnique({ where: { code: 'RUH' } });
  const jeddah = await prisma.city.findUnique({ where: { code: 'JED' } });
  const main = await prisma.location.upsert({
    where: { code: 'MAIN' },
    create: { code: 'MAIN', type: 'WAREHOUSE', nameAr: 'المستودع الرئيسي - الرياض', nameEn: 'Main warehouse – Riyadh', cityId: riyadh?.id },
    update: {},
  });
  await prisma.location.upsert({
    where: { code: 'JED-01' },
    create: { code: 'JED-01', type: 'BRANCH', nameAr: 'فرع جدة - الروضة', nameEn: 'Jeddah branch – Ar Rawdah', cityId: jeddah?.id, isPickupPoint: true },
    update: {},
  });
  await prisma.location.upsert({
    where: { code: 'WS-01' },
    create: { code: 'WS-01', type: 'WORKSHOP', nameAr: 'مشغل التفصيل', nameEn: 'Tailoring workshop', cityId: riyadh?.id },
    update: {},
  });
  log('✓ locations');

  // Attributes and values
  const attrIds = new Map<string, string>();
  const valueIds = new Map<string, string>();
  for (const [i, a] of SEED_ATTRIBUTES.entries()) {
    const attr = await prisma.attribute.upsert({
      where: { key: a.key },
      create: { key: a.key, nameAr: a.ar, nameEn: a.en, type: a.type, unit: a.unit, sortOrder: i },
      update: { nameAr: a.ar, nameEn: a.en, type: a.type, unit: a.unit },
    });
    attrIds.set(a.key, attr.id);
    for (const [j, v] of a.values.entries()) {
      const value = await prisma.attributeValue.upsert({
        where: { attributeId_code: { attributeId: attr.id, code: v.code } },
        create: { attributeId: attr.id, code: v.code, labelAr: v.ar, labelEn: v.en, swatchHex: v.hex, numericValue: v.num, sortOrder: j },
        update: { labelAr: v.ar, labelEn: v.en, swatchHex: v.hex, numericValue: v.num, sortOrder: j },
      });
      valueIds.set(`${a.key}:${v.code}`, value.id);
    }
  }
  log(`✓ ${SEED_ATTRIBUTES.length} attributes, ${valueIds.size} values`);

  // Size guides
  const guideIds = new Map<string, string>();
  for (const g of SEED_SIZE_GUIDES) {
    const existing = await prisma.sizeGuide.findUnique({ where: { key: g.key } });
    const guide = existing ?? (await merch.createSizeGuide(g));
    guideIds.set(g.key, guide.id);
  }
  log(`✓ ${SEED_SIZE_GUIDES.length} size guides`);

  // Categories
  const categoryIds = new Map<string, string>();
  for (const [i, c] of SEED_CATEGORIES.entries()) {
    let category = await prisma.category.findUnique({ where: { slugEn: c.key } });
    if (!category) {
      category = await categories.create({
        parentId: c.parent ? categoryIds.get(c.parent) : undefined,
        vertical: c.vertical,
        nameAr: c.ar,
        nameEn: c.en,
        slugEn: c.key,
        descriptionAr: c.descAr,
        descriptionEn: c.descEn,
        seoTitleAr: c.ar,
        seoTitleEn: c.en,
        seoDescriptionAr: c.descAr.slice(0, 160),
        seoDescriptionEn: c.descEn.slice(0, 160),
        sizeGuideId: c.sizeGuide ? guideIds.get(c.sizeGuide) : undefined,
        sortOrder: i,
      });
    }
    categoryIds.set(c.key, category.id);
    if (c.attributes) {
      await categories.setAttributes(category.id, {
        items: c.attributes.map((a, sortOrder) => ({
          attributeId: attrIds.get(a.key)!,
          isFacet: a.facet ?? true,
          isVariantAxis: a.axis ?? false,
          isRequired: a.required ?? false,
          sortOrder,
        })),
      });
    }
  }
  log(`✓ ${SEED_CATEGORIES.length} categories`);

  // Collections
  const collectionIds = new Map<string, string>();
  for (const col of SEED_COLLECTIONS) {
    const existing = await prisma.collection.findUnique({ where: { slugEn: col.key } });
    const c =
      existing ??
      (await merch.createCollection({ type: col.type, nameAr: col.ar, nameEn: col.en, slugEn: col.key, descriptionAr: col.descAr, descriptionEn: col.descEn }));
    collectionIds.set(col.key, c.id);
  }

  // Products
  const colorHex = new Map(SEED_ATTRIBUTES.find((a) => a.key === 'color')!.values.map((v) => [v.code, v.hex!]));
  const productIdByName = new Map<string, string>();
  const collectionMembers = new Map<string, string[]>();
  let created = 0;

  for (const [index, sp] of SEED_PRODUCTS.entries()) {
    const categoryId = categoryIds.get(sp.category)!;
    const vertical = SEED_CATEGORIES.find((c) => c.key === sp.category)!.vertical;
    const existing = await prisma.product.findFirst({ where: { nameEn: sp.en } });
    if (existing) {
      productIdByName.set(sp.en, existing.id);
      for (const key of sp.collections ?? []) collectionMembers.set(key, [...(collectionMembers.get(key) ?? []), existing.id]);
      continue;
    }
    const attributeValueIds = Object.entries(sp.attrs).flatMap(([k, codes]) => codes.map((code) => valueIds.get(`${k}:${code}`)!));
    const product = await products.create({
      categoryId,
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
      pricingMode: sp.pricingMode ?? 'FIXED',
      basePrice: Math.round(sp.price * 100),
      compareAtPrice: sp.compareAt ? Math.round(sp.compareAt * 100) : undefined,
      isMadeToMeasure: sp.madeToMeasure ?? false,
      sampleAvailable: sp.sample !== undefined,
      samplePrice: sp.sample !== undefined ? Math.round(sp.sample * 100) : undefined,
      photoStyle: sp.photoStyle,
      attributeValueIds,
    });

    const axes = Object.entries(sp.axes).map(([attributeKey, valueCodes]) => ({ attributeKey, valueCodes }));
    const generated = await products.generateVariants(product.id, { axes });
    let detail = generated.product;

    // Axis price overrides (e.g. king size costs more).
    for (const v of detail.variants.filter((x) => x.isActive)) {
      const override = v.options
        .map((o) => sp.axisPrices?.[o.attributeKey]?.[o.code])
        .find((p): p is number => p !== undefined);
      if (override !== undefined) await prisma.productVariant.update({ where: { id: v.id }, data: { price: Math.round(override * 100) } });
    }

    // Images: one per first two colours, linked to the first variant of that colour.
    const colors = sp.axes['color'] ?? ['beige'];
    const items: Array<{ mediaId: string; variantId?: string }> = [];
    for (const [i, color] of colors.slice(0, 2).entries()) {
      const png = await renderProductImage(vertical, colorHex.get(color) ?? '#D8C3A5', i === 0 ? 'main' : 'alt');
      const colorLabel = SEED_ATTRIBUTES.find((a) => a.key === 'color')!.values.find((v) => v.code === color)!;
      const asset = await media.upload({ buffer: png, originalname: `${product.skuPrefix}-${color}.png`, size: png.length }, undefined, {
        altAr: `${sp.ar} - ${colorLabel.ar}`,
        altEn: `${sp.en} – ${colorLabel.en}`,
      });
      await media.generateRenditions(asset.id);
      const variant = detail.variants.find((v) => v.isActive && v.options.some((o) => o.attributeKey === 'color' && o.code === color));
      items.push({ mediaId: asset.id, variantId: variant?.id });
    }
    detail = await products.setMedia(product.id, { items });

    // Stock (deterministic): made-to-measure items are produced per order and need none.
    if (!sp.madeToMeasure) {
      for (const v of detail.variants.filter((x) => x.isActive)) {
        const h = createHash('sha1').update(v.sku).digest()[0]!;
        const onHand = h % 13 === 0 ? 0 : h % 7 === 0 ? 2 : 5 + (h % 30);
        await inventory.setStock(v.id, { locationId: main.id, onHand, note: 'Seed stock' }, undefined, 'INITIAL');
      }
    }

    await products.publish(product.id);
    productIdByName.set(sp.en, product.id);
    for (const key of sp.collections ?? []) collectionMembers.set(key, [...(collectionMembers.get(key) ?? []), product.id]);
    created++;
    log(`  ✓ [${index + 1}/${SEED_PRODUCTS.length}] ${sp.en} (${generated.created} variants)`);
  }
  log(`✓ products: ${created} created, ${SEED_PRODUCTS.length - created} already present`);

  // Complete-the-look relations and collections
  for (const [name, related] of SEED_LOOKS) {
    const id = productIdByName.get(name);
    if (!id) continue;
    await products.setRelations(id, {
      items: related.map((r) => productIdByName.get(r)).filter((x): x is string => Boolean(x)).map((relatedId) => ({ relatedId, type: 'COMPLETE_THE_LOOK' as const })),
    });
  }
  for (const [key, ids] of collectionMembers) await merch.setCollectionProducts(collectionIds.get(key)!, { productIds: ids });
  log('✓ relations and collections');

  // Home hero banners (bilingual; one artwork per language would also be supported).
  if ((await prisma.banner.count()) === 0) {
    const banners = [
      { vertical: 'CURTAINS', color: '#3B4048', accent: '#2F6F6A', titleAr: 'ستائر تفصيل بمقاس نافذتك', titleEn: 'Curtains made to your window', subtitleAr: 'قياس وتركيب مجاني في الرياض وجدة والدمام', subtitleEn: 'Free measuring and installation in Riyadh, Jeddah and Dammam', ctaAr: 'اكتشفي الستائر', ctaEn: 'Explore curtains', link: '/c/curtains' },
      { vertical: 'ABAYAS', color: '#151515', accent: '#C9A227', titleAr: 'تشكيلة رمضان', titleEn: 'The Ramadan collection', subtitleAr: 'عبايات مطرزة ومفارش ومجالس لأجمل الليالي', subtitleEn: 'Embroidered abayas, bedding and majlis covers for the holy month', ctaAr: 'تسوّقي التشكيلة', ctaEn: 'Shop the collection', link: '/collections/ramadan' },
      { vertical: 'BEDDING', color: '#F2EADB', accent: '#9CC5E0', titleAr: 'نوم أعمق بقطن مصري', titleEn: 'Sleep deeper in Egyptian cotton', subtitleAr: 'أطقم ملايات 600 خيط بخصم يصل إلى 20٪', subtitleEn: '600-thread-count sheet sets, up to 20% off', ctaAr: 'تسوّقي المفارش', ctaEn: 'Shop bedding', link: '/c/bedding' },
    ];
    for (const [i, b] of banners.entries()) {
      const png = await renderBannerImage(b.vertical, b.color, b.accent);
      const image = await media.upload({ buffer: png, originalname: `banner-${i}.png`, size: png.length }, undefined, { altAr: b.titleAr, altEn: b.titleEn });
      await media.generateRenditions(image.id);
      await prisma.banner.create({
        data: { placement: 'HERO', sortOrder: i, titleAr: b.titleAr, titleEn: b.titleEn, subtitleAr: b.subtitleAr, subtitleEn: b.subtitleEn, ctaAr: b.ctaAr, ctaEn: b.ctaEn, link: b.link, imageArId: image.id, imageEnId: image.id },
      });
    }
    await prisma.banner.create({
      data: { placement: 'STRIP', titleAr: 'عينات القماش مجانية', titleEn: 'Free fabric samples', subtitleAr: 'اطلبي حتى 3 عينات لكل منتج قبل التفصيل', subtitleEn: 'Order up to 3 swatches per product before you commit', link: '/c/custom-curtains' },
    });
    log('✓ banners');
  }

  await seedConfigurators(prisma, log);

  const { indexed } = await search.reindexAll();
  log(`✓ search index: ${indexed} products`);

  // Seeding processed renditions and indexing inline; drop the duplicate queued jobs.
  for (const name of [QUEUES.media, QUEUES.search]) {
    const queue = app.get<Queue>(getQueueToken(name));
    await queue.drain(true);
  }
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

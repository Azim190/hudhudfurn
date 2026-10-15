import sharp from 'sharp';
import { SearchService } from '../src/modules/search/search.service';
import { bearer, closeTestApp, createTestApp, loginCustomer, loginStaff, resetState, totpSecrets, type TestContext } from './helpers';

const API = '/api/v1';
let ctx: TestContext;
let admin: string;

/** Poll until `check` returns a truthy value (async workers: renditions, indexing, imports). */
async function eventually<T>(check: () => Promise<T | undefined | null | false>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 250));
  }
}

const png = (color = '#6D1A36') =>
  sharp({ create: { width: 800, height: 1000, channels: 3, background: color } }).png().toBuffer();

async function setupCatalog() {
  const color = await ctx.http().post(`${API}/admin/attributes`).set(bearer(admin)).send({ key: 'color', nameAr: 'اللون', nameEn: 'Colour', type: 'COLOR' }).expect(201);
  for (const v of [
    { code: 'black', labelAr: 'أسود', labelEn: 'Black', swatchHex: '#111111' },
    { code: 'navy', labelAr: 'كحلي', labelEn: 'Navy', swatchHex: '#1F3A5F' },
    { code: 'burgundy', labelAr: 'عنابي', labelEn: 'Burgundy', swatchHex: '#6D1A36' },
  ]) {
    await ctx.http().post(`${API}/admin/attributes/${color.body.id}/values`).set(bearer(admin)).send(v).expect(201);
  }
  const fabric = await ctx.http().post(`${API}/admin/attributes`).set(bearer(admin)).send({ key: 'abaya_fabric', nameAr: 'القماش', nameEn: 'Fabric' }).expect(201);
  const crepe = await ctx.http().post(`${API}/admin/attributes/${fabric.body.id}/values`).set(bearer(admin)).send({ code: 'crepe', labelAr: 'كريب', labelEn: 'Crepe' }).expect(201);

  const root = await ctx.http().post(`${API}/admin/categories`).set(bearer(admin)).send({ vertical: 'ABAYAS', nameAr: 'العبايات', nameEn: 'Abayas' }).expect(201);
  expect(root.body).toMatchObject({ slugAr: 'العبايات', slugEn: 'abayas' });
  const child = await ctx
    .http()
    .post(`${API}/admin/categories`)
    .set(bearer(admin))
    .send({ vertical: 'ABAYAS', parentId: root.body.id, nameAr: 'عبايات يومية', nameEn: 'Everyday abayas' })
    .expect(201);
  await ctx
    .http()
    .put(`${API}/admin/categories/${root.body.id}/attributes`)
    .set(bearer(admin))
    .send({ items: [{ attributeId: color.body.id, isVariantAxis: true }, { attributeId: fabric.body.id }] })
    .expect(200);
  const location = await ctx.http().post(`${API}/admin/locations`).set(bearer(admin)).send({ code: 'MAIN', type: 'WAREHOUSE', nameAr: 'المستودع الرئيسي' }).expect(201);
  return { root: root.body, child: child.body, crepeId: crepe.body.id as string, locationId: location.body.id as string };
}

async function createPublishedProduct(setup: Awaited<ReturnType<typeof setupCatalog>>) {
  const product = await ctx
    .http()
    .post(`${API}/admin/products`)
    .set(bearer(admin))
    .send({
      categoryId: setup.child.id,
      nameAr: 'عباية كريب مقفلة',
      nameEn: 'Closed Crepe Abaya',
      descriptionAr: 'عباية مقفلة من الكريب الياباني المطفي بقصة مستقيمة مريحة.',
      basePrice: 29900,
      attributeValueIds: [setup.crepeId],
    })
    .expect(201);
  const id: string = product.body.id;
  expect(product.body).toMatchObject({ status: 'DRAFT', skuPrefix: 'ABY-0001', slugEn: 'closed-crepe-abaya', slugAr: 'عباية-كريب-مقفلة' });

  const generated = await ctx
    .http()
    .post(`${API}/admin/products/${id}/variants/generate`)
    .set(bearer(admin))
    .send({ axes: [{ attributeKey: 'color', valueCodes: ['black', 'navy'] }] })
    .expect(201);
  expect(generated.body).toMatchObject({ created: 2, deactivated: 1 }); // the initial default variant is replaced

  const blocked = await ctx.http().post(`${API}/admin/products/${id}/publish`).set(bearer(admin)).expect(400);
  expect(blocked.body.details.missing).toEqual(expect.arrayContaining(['images']));

  const upload = await ctx
    .http()
    .post(`${API}/admin/media`)
    .set(bearer(admin))
    .field('altAr', 'عباية سوداء')
    .attach('file', await png('#111111'), { filename: 'abaya.png', contentType: 'image/png' })
    .expect(201);
  expect(upload.body.status).toBe('PROCESSING');
  const ready = await eventually(async () => {
    const list = await ctx.http().get(`${API}/admin/media`).set(bearer(admin)).expect(200);
    const asset = list.body.items.find((m: { id: string }) => m.id === upload.body.id);
    return asset?.status === 'READY' ? asset : undefined;
  });
  expect(ready.renditions.map((r: { format: string; width: number }) => `${r.format}${r.width}`)).toEqual(
    expect.arrayContaining(['webp320', 'avif320', 'webp640', 'webp800']),
  );

  const black = generated.body.product.variants.find((v: { options: Array<{ code: string }>; isActive: boolean }) => v.isActive && v.options[0]?.code === 'black');
  await ctx.http().put(`${API}/admin/products/${id}/media`).set(bearer(admin)).send({ items: [{ mediaId: upload.body.id, variantId: black.id }] }).expect(200);
  await ctx.http().put(`${API}/admin/variants/${black.id}/stock`).set(bearer(admin)).send({ locationId: setup.locationId, onHand: 7 }).expect(200);
  const published = await ctx.http().post(`${API}/admin/products/${id}/publish`).set(bearer(admin)).expect(201);
  expect(published.body.status).toBe('ACTIVE');
  return { id, blackVariantId: black.id as string, slugEn: published.body.slugEn as string };
}

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => closeTestApp(ctx));
beforeEach(async () => {
  await resetState(ctx);
  totpSecrets.clear();
  await ctx.app.get(SearchService).reindexAll();
  admin = (await loginStaff(ctx)).accessToken;
});

describe('catalog administration', () => {
  it('creates, publishes and serves a bilingual product end to end', async () => {
    const setup = await setupCatalog();
    const { slugEn } = await createPublishedProduct(setup);

    const page = await ctx.http().get(`${API}/products/${encodeURIComponent('عباية-كريب-مقفلة')}`).expect(200);
    expect(page.body).toMatchObject({ nameEn: 'Closed Crepe Abaya', slugEn, price: 29900, inStock: true });
    expect(page.body.breadcrumb.map((b: { nameEn: string }) => b.nameEn)).toEqual(['Abayas', 'Everyday abayas']);
    const byColor = Object.fromEntries(page.body.variants.map((v: { options: { color: string }; available: boolean }) => [v.options.color, v.available]));
    expect(byColor).toEqual({ black: true, navy: false });
    expect(page.body.attributes).toEqual([expect.objectContaining({ key: 'abaya_fabric', values: [expect.objectContaining({ code: 'crepe' })] })]);
    expect(page.body.media[0].renditions.length).toBeGreaterThan(0);

    // Listing through the search index (indexing is asynchronous).
    const listing = await eventually(async () => {
      const res = await ctx.http().get(`${API}/products?category=abayas`).expect(200);
      return res.body.total === 1 ? res.body : undefined;
    });
    expect(listing.degraded).toBe(false);
    expect(listing.items[0]).toMatchObject({ nameAr: 'عباية كريب مقفلة', inStock: true, swatches: expect.arrayContaining([expect.objectContaining({ code: 'black' })]) });
    expect(listing.facetCounts.color).toEqual({ black: 1, navy: 1 });

    const filtered = await ctx.http().get(`${API}/products?category=abayas&f.abaya_fabric=crepe&f.color=navy`).expect(200);
    expect(filtered.body.total).toBe(1);
    const search = await ctx.http().get(`${API}/search?q=${encodeURIComponent('عباءه كريب')}`).expect(200);
    expect(search.body.items.map((i: { nameEn: string }) => i.nameEn)).toEqual(['Closed Crepe Abaya']);
  });

  it('hides drafts and archived products from the storefront', async () => {
    const setup = await setupCatalog();
    const { id, slugEn } = await createPublishedProduct(setup);
    await ctx.http().post(`${API}/admin/products/${id}/archive`).set(bearer(admin)).expect(201);
    await ctx.http().get(`${API}/products/${slugEn}`).expect(404);
    await eventually(async () => (await ctx.http().get(`${API}/products?category=abayas`)).body.total === 0);
  });

  it('regenerates the variant matrix without deleting variants', async () => {
    const setup = await setupCatalog();
    const { id } = await createPublishedProduct(setup);
    const res = await ctx
      .http()
      .post(`${API}/admin/products/${id}/variants/generate`)
      .set(bearer(admin))
      .send({ axes: [{ attributeKey: 'color', valueCodes: ['navy', 'burgundy'] }] })
      .expect(201);
    expect(res.body).toMatchObject({ created: 1, deactivated: 1 });
    const variants = res.body.product.variants as Array<{ optionKey: string; isActive: boolean; isDefault: boolean }>;
    expect(variants.filter((v) => v.isActive).map((v) => v.optionKey).sort()).toEqual(['color=burgundy', 'color=navy']);
    expect(variants.find((v) => v.optionKey === 'color=black')?.isActive).toBe(false);
    expect(variants.filter((v) => v.isDefault)).toHaveLength(1);
  });

  it('rejects variant axes and attribute values the category does not allow', async () => {
    const setup = await setupCatalog();
    const p = await ctx.http().post(`${API}/admin/products`).set(bearer(admin)).send({ categoryId: setup.child.id, nameAr: 'منتج', basePrice: 1000 }).expect(201);
    const notAxis = await ctx
      .http()
      .post(`${API}/admin/products/${p.body.id}/variants/generate`)
      .set(bearer(admin))
      .send({ axes: [{ attributeKey: 'abaya_fabric', valueCodes: ['crepe'] }] })
      .expect(400);
    expect(notAxis.body.details.reason).toBe('notVariantAxis');
    await ctx
      .http()
      .post(`${API}/admin/products/${p.body.id}/variants/generate`)
      .set(bearer(admin))
      .send({ axes: [{ attributeKey: 'color', valueCodes: ['purple'] }] })
      .expect(400);
  });

  it('keeps stock history and refuses negative stock', async () => {
    const setup = await setupCatalog();
    const { blackVariantId } = await createPublishedProduct(setup);
    await ctx.http().put(`${API}/admin/variants/${blackVariantId}/stock`).set(bearer(admin)).send({ locationId: setup.locationId, onHand: 3, note: 'count' }).expect(200);
    await ctx.http().put(`${API}/admin/variants/${blackVariantId}/stock`).set(bearer(admin)).send({ locationId: setup.locationId, onHand: -1 }).expect(400);
    const moves = await ctx.http().get(`${API}/admin/variants/${blackVariantId}/movements`).set(bearer(admin)).expect(200);
    expect(moves.body.map((m: { quantity: number; reason: string }) => [m.quantity, m.reason])).toEqual([
      [-4, 'ADJUSTMENT'],
      [7, 'INITIAL'],
    ]);
  });

  it('protects category integrity', async () => {
    const setup = await setupCatalog();
    await createPublishedProduct(setup);
    const del = await ctx.http().delete(`${API}/admin/categories/${setup.root.id}`).set(bearer(admin)).expect(409);
    expect(del.body.details).toMatchObject({ reason: 'inUse', children: 1 });
    const cycle = await ctx.http().patch(`${API}/admin/categories/${setup.root.id}`).set(bearer(admin)).send({ parentId: setup.child.id }).expect(400);
    expect(cycle.body.details.reason).toBe('categoryCycle');
    const tree = await ctx.http().get(`${API}/categories`).expect(200);
    expect(tree.body[0]).toMatchObject({ nameEn: 'Abayas', productCount: 1, children: [expect.objectContaining({ productCount: 1 })] });
  });

  it('validates uploads by content', async () => {
    await ctx.http().post(`${API}/admin/media`).set(bearer(admin)).attach('file', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' }).expect(400);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    const res = await ctx.http().post(`${API}/admin/media`).set(bearer(admin)).attach('file', svg, { filename: 'x.svg', contentType: 'image/svg+xml' }).expect(400);
    expect(res.body.details.reason).toBe('unsupportedFormat');
  });

  it('requires catalog permissions', async () => {
    const customer = await loginCustomer(ctx);
    await ctx.http().post(`${API}/admin/products`).set(bearer(customer.accessToken)).send({}).expect(403);
    await ctx.http().get(`${API}/admin/products`).expect(401);
  });
});

describe('bulk import and export', () => {
  it('imports products from CSV with per-row errors and exports them back', async () => {
    await setupCatalog();
    const csv = [
      'sku_prefix,category_slug,name_ar,name_en,description_ar,pricing_mode,base_price_sar,status,product_attributes,variant_options,variant_price_sar,stock,location_code',
      'ABY-0100,everyday-abayas,عباية مستوردة,Imported Abaya,وصف عربي طويل بما يكفي لاجتياز فحص الاكتمال,FIXED,199.5,DRAFT,abaya_fabric=crepe,color=black,,4,MAIN',
      'ABY-0100,everyday-abayas,عباية مستوردة,Imported Abaya,وصف عربي طويل بما يكفي لاجتياز فحص الاكتمال,FIXED,199.5,DRAFT,abaya_fabric=crepe,color=navy,219,0,MAIN',
      'ABY-0101,everyday-abayas,عباية خاطئة,Broken Abaya,,FIXED,150,DRAFT,,color=purple,,,',
    ].join('\n');
    const res = await ctx.http().post(`${API}/admin/products/import`).set(bearer(admin)).attach('file', Buffer.from(csv), { filename: 'products.csv', contentType: 'text/csv' }).expect(201);
    const job = await eventually(async () => {
      const j = await ctx.http().get(`${API}/admin/jobs/${res.body.id}`).set(bearer(admin)).expect(200);
      return ['SUCCEEDED', 'FAILED'].includes(j.body.status) ? j.body : undefined;
    });
    expect(job.summary.products).toEqual({ created: 1, updated: 0, failed: 1 });
    expect(job.summary.errors).toEqual([{ row: 4, message: 'Unknown attribute value color=purple' }]);

    const list = await ctx.http().get(`${API}/admin/products?q=ABY-0100`).set(bearer(admin)).expect(200);
    expect(list.body.items).toHaveLength(1);
    const product = await ctx.http().get(`${API}/admin/products/${list.body.items[0].id}`).set(bearer(admin)).expect(200);
    expect(product.body.basePrice).toBe(19950);
    const active = product.body.variants.filter((v: { isActive: boolean }) => v.isActive);
    expect(active.map((v: { sku: string; price: number | null; available: number }) => [v.sku, v.price, v.available]).sort()).toEqual([
      ['ABY-0100-BLACK', null, 4],
      ['ABY-0100-NAVY', 21900, 0],
    ]);
    expect(await ctx.prisma.product.count({ where: { skuPrefix: 'ABY-0101' } })).toBe(0); // invalid rows never half-import

    const exported = await ctx.http().get(`${API}/admin/products/export?format=csv`).set(bearer(admin)).buffer(true).expect(200);
    const text = exported.text ?? exported.body.toString();
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('ABY-0100-NAVY');
    expect(text).toContain('عباية مستوردة');
  });

  it('rejects files with missing required columns', async () => {
    const res = await ctx.http().post(`${API}/admin/products/import`).set(bearer(admin)).attach('file', Buffer.from('foo,bar\n1,2'), { filename: 'x.csv', contentType: 'text/csv' }).expect(400);
    expect(res.body.details.reason).toBe('missingColumns');
  });
});

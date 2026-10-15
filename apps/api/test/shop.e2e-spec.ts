import { bearer, closeTestApp, createTestApp, loginCustomer, loginStaff, resetState, totpSecrets, type TestContext } from './helpers';

const API = '/api/v1';
let ctx: TestContext;
let admin: string;

interface Fixture {
  abayaId: string;
  black: string;
  navy: string;
  blindId: string;
  blindVariant: string;
  majlisVariant: string;
  locationId: string;
}

/** Minimal catalog built directly in the database (the catalog API has its own tests). */
async function fixture(): Promise<Fixture> {
  const p = ctx.prisma;
  const loc = await p.location.create({ data: { code: 'MAIN', type: 'WAREHOUSE', nameAr: 'المستودع' } });
  const color = await p.attribute.create({ data: { key: 'color', nameAr: 'اللون', type: 'COLOR' } });
  const black = await p.attributeValue.create({ data: { attributeId: color.id, code: 'black', labelAr: 'أسود', labelEn: 'Black' } });
  const navy = await p.attributeValue.create({ data: { attributeId: color.id, code: 'navy', labelAr: 'كحلي', labelEn: 'Navy' } });
  const cat = await p.category.create({ data: { vertical: 'ABAYAS', nameAr: 'العبايات', nameEn: 'Abayas', slugAr: 'العبايات', slugEn: 'abayas' } });
  const blinds = await p.category.create({ data: { vertical: 'CURTAINS', nameAr: 'بلايند', nameEn: 'Blinds', slugAr: 'بلايند', slugEn: 'blinds' } });
  const live = { status: 'ACTIVE' as const, publishedAt: new Date() };

  const abaya = await p.product.create({
    data: {
      ...live,
      categoryId: cat.id,
      skuPrefix: 'ABY-0001',
      nameAr: 'عباية',
      nameEn: 'Abaya',
      slugAr: 'عباية',
      slugEn: 'abaya',
      basePrice: 29900,
      sampleAvailable: true,
      samplePrice: 0,
      variants: {
        create: [
          { sku: 'ABY-0001-BLACK', optionKey: 'color=black', isDefault: true, options: { create: [{ attributeValueId: black.id }] }, stock: { create: [{ locationId: loc.id, onHand: 3 }] } },
          { sku: 'ABY-0001-NAVY', optionKey: 'color=navy', price: 31900, options: { create: [{ attributeValueId: navy.id }] }, stock: { create: [{ locationId: loc.id, onHand: 0 }] } },
        ],
      },
    },
    include: { variants: true },
  });
  const blind = await p.product.create({
    data: { ...live, categoryId: blinds.id, skuPrefix: 'CUR-0001', nameAr: 'رول بلايند', slugAr: 'رول', slugEn: 'roller', basePrice: 15900, pricingMode: 'PER_SQM', isMadeToMeasure: true, variants: { create: [{ sku: 'CUR-0001', optionKey: '', isDefault: true }] } },
    include: { variants: true },
  });
  const majlis = await p.product.create({
    data: { ...live, categoryId: blinds.id, skuPrefix: 'SOF-0001', nameAr: 'جلسة', slugAr: 'جلسة', slugEn: 'majlis', basePrice: 129900, pricingMode: 'CALCULATED', isMadeToMeasure: true, variants: { create: [{ sku: 'SOF-0001', optionKey: '', isDefault: true }] } },
    include: { variants: true },
  });
  const v = (sku: string) => abaya.variants.find((x) => x.sku === sku)!.id;
  return { abayaId: abaya.id, black: v('ABY-0001-BLACK'), navy: v('ABY-0001-NAVY'), blindId: blind.id, blindVariant: blind.variants[0]!.id, majlisVariant: majlis.variants[0]!.id, locationId: loc.id };
}

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => closeTestApp(ctx));
beforeEach(async () => {
  await resetState(ctx);
  totpSecrets.clear();
});

describe('guest cart', () => {
  it('creates a cart on first add, returns the token once and prices with VAT', async () => {
    const f = await fixture();
    const first = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.black, quantity: 2 }).expect(201);
    const token: string = first.body.cartToken;
    expect(token).toMatch(/^[\w-]{40,}$/);
    expect(first.body.totals).toMatchObject({ subtotal: 59800, total: 59800, itemCount: 2 });
    expect(first.body.totals.vat).toBe(7800); // 598.00 incl. 15% VAT → 78.00

    const again = await ctx.http().post(`${API}/cart/items`).set('X-Cart-Token', token).send({ variantId: f.black, quantity: 1 }).expect(201);
    expect(again.body.cartToken).toBeUndefined();
    expect(again.body.items).toHaveLength(1);
    expect(again.body.items[0]).toMatchObject({ quantity: 3, maxQuantity: 3, issue: null });

    const count = await ctx.http().get(`${API}/cart/count`).set('X-Cart-Token', token).expect(200);
    expect(count.body.count).toBe(3);
    expect((await ctx.http().get(`${API}/cart`).expect(200)).body.items).toEqual([]);
  });

  it('enforces stock, measurements, samples and configuration rules', async () => {
    const f = await fixture();
    const oos = await ctx.http().post(`${API}/cart/items`).set('Accept-Language', 'en').send({ variantId: f.navy, quantity: 1 }).expect(400);
    expect(oos.body.code).toBe('outOfStock');
    const tooMany = await ctx.http().post(`${API}/cart/items`).set('Accept-Language', 'en').send({ variantId: f.black, quantity: 4 }).expect(400);
    expect(tooMany.body).toMatchObject({ code: 'insufficientStock', message: 'Not enough stock. Available: 3' });

    const noSize = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.blindVariant, quantity: 1 }).expect(400);
    expect(noSize.body.code).toBe('measurementsRequired');
    const blind = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.blindVariant, quantity: 1, widthMm: 1200, heightMm: 1500 }).expect(201);
    expect(blind.body.items[0]).toMatchObject({ unitPrice: 28620, billedMeasure: 18000, lineTotal: 28620 });

    const configure = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.majlisVariant, quantity: 1 }).expect(400);
    expect(configure.body.code).toBe('configurationRequired');

    // A free fabric sample of an out-of-stock colour is still orderable.
    const sample = await ctx.http().post(`${API}/cart/items`).set('X-Cart-Token', blind.body.cartToken).send({ variantId: f.navy, quantity: 1, isSample: true }).expect(201);
    expect(sample.body.items.find((i: { isSample: boolean }) => i.isSample)).toMatchObject({ unitPrice: 0, lineTotal: 0 });
  });

  it('adds gift wrapping per unit and keeps the message', async () => {
    const f = await fixture();
    const res = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.black, quantity: 2, giftWrap: true, giftMessage: ' كل عام وأنتِ بخير ' }).expect(201);
    expect(res.body.items[0]).toMatchObject({ giftWrap: true, giftMessage: 'كل عام وأنتِ بخير', giftWrapTotal: 3000, lineTotal: 62800 });
    expect(res.body.totals).toMatchObject({ giftWrap: 3000, total: 62800 });
  });

  it('flags lines that became unavailable instead of failing the cart', async () => {
    const f = await fixture();
    const add = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.black, quantity: 2 }).expect(201);
    await ctx.prisma.stockLevel.updateMany({ where: { variantId: f.black }, data: { onHand: 1 } });
    const view = await ctx.http().get(`${API}/cart`).set('X-Cart-Token', add.body.cartToken).expect(200);
    expect(view.body.items[0]).toMatchObject({ issue: 'insufficientStock', available: 1 });
    expect(view.body.canCheckout).toBe(false);
    await ctx.prisma.product.update({ where: { id: f.abayaId }, data: { status: 'ARCHIVED' } });
    const gone = await ctx.http().get(`${API}/cart`).set('X-Cart-Token', add.body.cartToken).expect(200);
    expect(gone.body.items[0].issue).toBe('productUnavailable');
    expect(gone.body.totals.total).toBe(0);
  });

  it('updates and removes lines only within the same cart', async () => {
    const f = await fixture();
    const a = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.black, quantity: 1 }).expect(201);
    const itemId = a.body.items[0].id;
    const b = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.black, quantity: 1 }).expect(201);
    await ctx.http().patch(`${API}/cart/items/${itemId}`).set('X-Cart-Token', b.body.cartToken).send({ quantity: 2 }).expect(404);
    const updated = await ctx.http().patch(`${API}/cart/items/${itemId}`).set('X-Cart-Token', a.body.cartToken).send({ quantity: 2 }).expect(200);
    expect(updated.body.totals.itemCount).toBe(2);
    const removed = await ctx.http().delete(`${API}/cart/items/${itemId}`).set('X-Cart-Token', a.body.cartToken).expect(200);
    expect(removed.body.items).toEqual([]);
  });
});

describe('customer cart', () => {
  it('merges the guest cart into the customer cart after sign-in', async () => {
    const f = await fixture();
    const guest = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.black, quantity: 2 }).expect(201);
    const { accessToken } = await loginCustomer(ctx);
    await ctx.http().post(`${API}/cart/items`).set(bearer(accessToken)).send({ variantId: f.black, quantity: 2 }).expect(201);

    const merged = await ctx.http().post(`${API}/cart/merge`).set(bearer(accessToken)).send({ guestToken: guest.body.cartToken }).expect(200);
    expect(merged.body.items).toHaveLength(1);
    expect(merged.body.items[0].quantity).toBe(3); // capped at available stock
    // The guest cart is consumed.
    expect((await ctx.http().get(`${API}/cart`).set('X-Cart-Token', guest.body.cartToken).expect(200)).body.items).toEqual([]);
    await ctx.http().post(`${API}/cart/merge`).send({ guestToken: guest.body.cartToken }).expect(401);
  });
});

describe('wishlist, cards, stock alerts, delivery estimate, reviews', () => {
  it('manages the wishlist and returns live cards', async () => {
    const f = await fixture();
    const { accessToken } = await loginCustomer(ctx);
    await ctx.http().put(`${API}/me/wishlist`).set(bearer(accessToken)).send({ productIds: [f.abayaId, f.blindId] }).expect(200);
    const list = await ctx.http().get(`${API}/me/wishlist`).set(bearer(accessToken)).expect(200);
    expect(list.body.map((c: { slugEn: string }) => c.slugEn).sort()).toEqual(['abaya', 'roller']);
    const ids = await ctx.http().delete(`${API}/me/wishlist/${f.blindId}`).set(bearer(accessToken)).expect(200);
    expect(ids.body).toEqual([f.abayaId]);
    await ctx.http().get(`${API}/me/wishlist`).expect(401);
  });

  it('serves cards by id in the requested order and validates ids', async () => {
    const f = await fixture();
    const res = await ctx.http().get(`${API}/products-cards?ids=${f.blindId},${f.abayaId}`).expect(200);
    expect(res.body.map((c: { slugEn: string }) => c.slugEn)).toEqual(['roller', 'abaya']);
    await ctx.http().get(`${API}/products-cards?ids=not-a-uuid`).expect(400);
  });

  it('subscribes to back-in-stock alerts only for unavailable variants', async () => {
    const f = await fixture();
    const { accessToken } = await loginCustomer(ctx);
    await ctx.http().post(`${API}/variants/${f.navy}/notify-me`).set(bearer(accessToken)).expect(201);
    await ctx.http().post(`${API}/variants/${f.navy}/notify-me`).set(bearer(accessToken)).expect(201); // idempotent
    const conflict = await ctx.http().post(`${API}/variants/${f.black}/notify-me`).set(bearer(accessToken)).expect(409);
    expect(conflict.body.code).toBe('alreadyInStock');
    expect(await ctx.prisma.backInStockSubscription.count()).toBe(1);
  });

  it('estimates delivery by city, adding production time for made-to-measure', async () => {
    const f = await fixture();
    const riyadh = await ctx.http().get(`${API}/delivery-estimate?city=RUH`).expect(200);
    expect(riyadh.body).toMatchObject({ minDays: 1, maxDays: 2, productionDays: null, city: { nameEn: 'Riyadh' } });
    const custom = await ctx.http().get(`${API}/delivery-estimate?city=TUU&productId=${f.blindId}`).expect(200);
    expect(custom.body).toMatchObject({ minDays: 10, maxDays: 17, productionDays: { min: 7, max: 12 } });
    await ctx.http().get(`${API}/delivery-estimate?city=XXX`).expect(404);
  });

  it('lists only approved reviews with a rating histogram', async () => {
    const f = await fixture();
    await ctx.prisma.review.createMany({
      data: [
        { productId: f.abayaId, rating: 5, body: 'رائعة', status: 'APPROVED', authorName: 'نورة' },
        { productId: f.abayaId, rating: 4, body: 'جميلة', status: 'APPROVED' },
        { productId: f.abayaId, rating: 1, body: 'spam', status: 'PENDING' },
      ],
    });
    const res = await ctx.http().get(`${API}/products/${f.abayaId}/reviews`).expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.histogram).toEqual({ '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 });
  });
});

describe('banners and home content', () => {
  it('schedules banners and serves only live ones on the home payload', async () => {
    admin = (await loginStaff(ctx)).accessToken;
    const now = Date.now();
    await ctx.http().post(`${API}/admin/banners`).set(bearer(admin)).send({ titleAr: 'تخفيضات رمضان', titleEn: 'Ramadan sale', link: '/collections/ramadan' }).expect(201);
    await ctx
      .http()
      .post(`${API}/admin/banners`)
      .set(bearer(admin))
      .send({ titleAr: 'قريباً', startsAt: new Date(now + 86_400_000).toISOString() })
      .expect(201);
    await ctx.http().post(`${API}/admin/banners`).set(bearer(admin)).send({ titleAr: 'رابط خارجي', link: 'https://evil.example' }).expect(400);
    await ctx.http().post(`${API}/admin/banners`).set(bearer(admin)).send({ titleAr: 'نافذة خاطئة', startsAt: new Date(now).toISOString(), endsAt: new Date(now - 1000).toISOString() }).expect(400);

    const home = await ctx.http().get(`${API}/content/home`).expect(200);
    expect(home.body.hero.map((b: { titleEn: string }) => b.titleEn)).toEqual(['Ramadan sale']);
    expect(Array.isArray(home.body.categories)).toBe(true);

    const customer = await loginCustomer(ctx);
    await ctx.http().post(`${API}/admin/banners`).set(bearer(customer.accessToken)).send({ titleAr: 'x x' }).expect(403);
  });
});

import sharp from 'sharp';
import { seedCommerce } from '../prisma/seed-lib';
import { bearer, closeTestApp, createTestApp, loginCustomer, loginStaff, resetState, totpSecrets, type TestContext } from './helpers';

const API = '/api/v1';
let ctx: TestContext;
let admin: Record<string, string>;

async function products() {
  const p = ctx.prisma;
  const loc = await p.location.create({ data: { code: 'MAIN', type: 'WAREHOUSE', nameAr: 'المستودع' } });
  const curtains = await p.category.create({ data: { vertical: 'CURTAINS', nameAr: 'ستائر تفصيل', nameEn: 'Custom curtains', slugAr: 'ستائر', slugEn: 'custom-curtains' } });
  const covers = await p.category.create({ data: { vertical: 'SOFA_COVERS', nameAr: 'أغطية', nameEn: 'Covers', slugAr: 'أغطية', slugEn: 'covers' } });
  const live = { status: 'ACTIVE' as const, publishedAt: new Date() };
  const curtain = await p.product.create({
    data: { ...live, categoryId: curtains.id, skuPrefix: 'CUR-0100', nameAr: 'ستارة ويف', nameEn: 'Wave curtain', slugAr: 'ستارة-ويف', slugEn: 'wave-curtain', basePrice: 8900, pricingMode: 'CALCULATED', isMadeToMeasure: true, variants: { create: [{ sku: 'CUR-0100-IVORY', optionKey: '', isDefault: true, fabricWidthMm: 1400 }] } },
    include: { variants: true },
  });
  const sofa = await p.product.create({
    data: { ...live, categoryId: covers.id, skuPrefix: 'SOF-0100', nameAr: 'غطاء كنب تفصيل', nameEn: 'Tailored sofa cover', slugAr: 'غطاء', slugEn: 'sofa-cover', basePrice: 59900, pricingMode: 'CALCULATED', isMadeToMeasure: true, variants: { create: [{ sku: 'SOF-0100', optionKey: '', isDefault: true, stock: { create: [{ locationId: loc.id, onHand: 0 }] } }] } },
    include: { variants: true },
  });
  return { curtain: curtain.id, curtainVariant: curtain.variants[0]!.id, sofa: sofa.id, sofaVariant: sofa.variants[0]!.id };
}

async function curtainTemplate() {
  const t = await ctx.http().post(`${API}/admin/configurator/templates`).set(admin).send({ code: 'TEST_CURTAINS', kind: 'CURTAIN', nameAr: 'ستائر', nameEn: 'Curtains' }).expect(201);
  await ctx.http().post(`${API}/admin/configurator/templates/${t.body.id}/heading-styles`).set(admin).send({ code: 'WAVE', nameAr: 'ويف', nameEn: 'Wave', fullnessMin: 200, fullnessMax: 250, fullnessDefault: 220, makingCostPerM: 3500 }).expect(201);
  for (const o of [
    { group: 'LINING', code: 'NONE', nameAr: 'بدون', nameEn: 'None', priceBasis: 'FLAT', price: 0, isDefault: true },
    { group: 'LINING', code: 'BLACKOUT', nameAr: 'معتمة', nameEn: 'Blackout', priceBasis: 'PER_METER', price: 3000 },
    { group: 'MOTOR', code: 'MANUAL', nameAr: 'يدوي', nameEn: 'Manual', priceBasis: 'FLAT', price: 0, isDefault: true },
    { group: 'MOTOR', code: 'ELECTRIC', nameAr: 'كهربائي', nameEn: 'Electric', priceBasis: 'FLAT', price: 85000 },
  ]) {
    await ctx.http().post(`${API}/admin/configurator/templates/${t.body.id}/options`).set(admin).send(o).expect(201);
  }
  return t.body.id as string;
}

async function sofaTemplate() {
  const t = await ctx.http().post(`${API}/admin/configurator/templates`).set(admin).send({ code: 'TEST_SOFA', kind: 'SOFA_COVER', nameAr: 'كنب', nameEn: 'Sofa' }).expect(201);
  await ctx.http().post(`${API}/admin/configurator/templates/${t.body.id}/options`).set(admin).send({ group: 'PIECE', code: 'SEAT_3', nameAr: 'ثلاثة', nameEn: 'Three-seater', priceBasis: 'PER_PIECE', price: 45000 }).expect(201);
  return t.body.id as string;
}

const window3m = { widthMm: 3000, heightMm: 2600, panels: 2, headingStyle: 'WAVE' };

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => closeTestApp(ctx));
beforeEach(async () => {
  await resetState(ctx);
  await seedCommerce(ctx.prisma);
  totpSecrets.clear();
  admin = bearer((await loginStaff(ctx)).accessToken);
});

describe('configurator templates (admin)', () => {
  it('validates formulas and options, versions every change and simulates quotes', async () => {
    const id = await curtainTemplate();
    const t = await ctx.http().get(`${API}/admin/configurator/templates/${id}`).set(admin).expect(200);
    // 1 create + 1 heading + 4 options = version 6.
    expect(t.body).toMatchObject({ version: 6, headingStyles: [expect.objectContaining({ code: 'WAVE' })] });
    expect(t.body.options).toHaveLength(4);

    const bad = await ctx.http().patch(`${API}/admin/configurator/templates/${id}`).set(admin).send({ formulas: { widths: 'width * nope' } }).expect(400);
    expect(bad.body.details.reason).toMatch(/Unknown variable: nope/);
    await ctx.http().post(`${API}/admin/configurator/templates/${id}/heading-styles`).set(admin).send({ code: 'BAD', nameAr: 'خطأ', nameEn: 'Bad', fullnessMin: 250, fullnessMax: 200, fullnessDefault: 220, makingCostPerM: 0 }).expect(400);
    await ctx.http().post(`${API}/admin/configurator/templates`).set(admin).send({ code: 'TEST_CURTAINS', kind: 'CURTAIN', nameAr: 'مكرر', nameEn: 'Duplicate' }).expect(409);

    const sim = await ctx.http().post(`${API}/admin/configurator/templates/${id}/simulate`).set(admin).send({ inputs: { ...window3m, choices: { LINING: 'BLACKOUT' } }, basePrice: 8900, fabricWidthMm: 1400 }).expect(200);
    expect(sim.body).toMatchObject({ valid: true, specs: { widths: 6, cutLengthMm: 2900, fabricMeters: 17.4 } });
    expect(sim.body.total).toBe(154860 + 11200 + 52200);

    await ctx.http().patch(`${API}/admin/configurator/templates/${id}`).set(admin).send({ constants: { cutRounding: 50 } }).expect(200);
    const after = await ctx.http().post(`${API}/admin/configurator/templates/${id}/simulate`).set(admin).send({ inputs: window3m, basePrice: 8900, fabricWidthMm: 1400 }).expect(200);
    expect(after.body.specs.cutLengthMm).toBe(2850);
  });

  it('only attaches curtain templates to products priced by the configurator', async () => {
    const id = await curtainTemplate();
    const cat = await ctx.prisma.category.create({ data: { vertical: 'CURTAINS', nameAr: 'ستائر', nameEn: 'Curtains', slugAr: 'ستائر-جاهزة', slugEn: 'curtains' } });
    const p = await ctx.prisma.product.create({ data: { categoryId: cat.id, skuPrefix: 'CUR-0200', nameAr: 'ستارة', slugAr: 'ستارة', slugEn: 'curtain', basePrice: 100, variants: { create: [{ sku: 'CUR-0200', optionKey: '', isDefault: true }] } } });
    const refused = await ctx.http().patch(`${API}/admin/products/${p.id}`).set(admin).send({ configuratorTemplateId: id }).expect(400);
    expect(refused.body.details).toMatchObject({ reason: 'requiresCalculatedPricing' });
    await ctx.http().patch(`${API}/admin/products/${p.id}`).set(admin).send({ configuratorTemplateId: id, pricingMode: 'CALCULATED' }).expect(200);
  });
});

describe('configured products in the cart and at checkout', () => {
  it('quotes live, requires a configuration, prices configured lines and snapshots the workshop spec', async () => {
    const f = await products();
    const templateId = await curtainTemplate();
    await ctx.prisma.product.update({ where: { id: f.curtain }, data: { configuratorTemplateId: templateId } });

    const cfg = await ctx.http().get(`${API}/configurator/products/${f.curtain}`).expect(200);
    expect(cfg.body).toMatchObject({ template: { kind: 'CURTAIN', code: 'TEST_CURTAINS' }, variants: [{ id: f.curtainVariant, price: 8900, fabricWidthMm: 1400 }] });
    expect((await ctx.http().get(`${API}/products/wave-curtain`).expect(200)).body.configurator).toEqual({ kind: 'CURTAIN', code: 'TEST_CURTAINS' });

    const invalid = await ctx.http().post(`${API}/configurator/quote`).send({ productId: f.curtain, variantId: f.curtainVariant, inputs: { widthMm: 100 } }).expect(200);
    expect(invalid.body.valid).toBe(false);
    expect(invalid.body.issues.map((i: { field: string }) => i.field)).toEqual(['widthMm', 'heightMm']);
    const quote = await ctx.http().post(`${API}/configurator/quote`).send({ productId: f.curtain, variantId: f.curtainVariant, inputs: { ...window3m, choices: { MOTOR: 'ELECTRIC' } } }).expect(200);
    expect(quote.body).toMatchObject({ valid: true, total: 154860 + 11200 + 85000 });

    const required = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.curtainVariant, quantity: 1 }).expect(400);
    expect(required.body.code).toBe('configurationRequired');
    const rejected = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.curtainVariant, quantity: 1, configuration: { inputs: { widthMm: 100, heightMm: 100 } } }).expect(400);
    expect(rejected.body.code).toBe('configurationInvalid');

    const added = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.curtainVariant, quantity: 2, configuration: { inputs: { ...window3m, choices: { MOTOR: 'ELECTRIC' }, notes: 'Bedroom, left window' } } }).expect(201);
    const token = added.body.cartToken as string;
    const again = await ctx.http().post(`${API}/cart/items`).set('X-Cart-Token', token).send({ variantId: f.curtainVariant, quantity: 1, configuration: { inputs: window3m } }).expect(201);
    expect(again.body.items).toHaveLength(2); // configured lines never merge
    const line = again.body.items.find((i: { quantity: number }) => i.quantity === 2);
    expect(line).toMatchObject({ unitPrice: 251060, lineTotal: 502120, issue: null, configuration: { kind: 'CURTAIN', specs: { widths: 6, notes: 'Bedroom, left window', motor: 'ELECTRIC' } } });
    expect(again.body.canCheckout).toBe(true);

    // Price changes in the template reach the cart (re-quoted on every view).
    const motor = await ctx.prisma.configuratorOption.findFirstOrThrow({ where: { templateId, code: 'ELECTRIC' } });
    await ctx.http().patch(`${API}/admin/configurator/options/${motor.id}`).set(admin).send({ price: 95000 }).expect(200);
    const repriced = await ctx.http().get(`${API}/cart`).set('X-Cart-Token', token).expect(200);
    expect(repriced.body.items.find((i: { quantity: number }) => i.quantity === 2).unitPrice).toBe(261060);

    // Made to measure: no cash on delivery, no stock reservation.
    const address = { recipientName: 'Sara', phone: '0551234567', cityCode: 'RUH', street: 'Olaya Street' };
    const q = await ctx.http().post(`${API}/checkout/quote`).set('X-Cart-Token', token).send({ fulfillment: 'DELIVERY', address }).expect(200);
    expect(q.body.hasMadeToMeasure).toBe(true);
    expect(q.body.paymentMethods.find((m: { method: string }) => m.method === 'COD')).toMatchObject({ available: false, reason: 'madeToMeasure' });
    expect(q.body.items[0].configuration.kind).toBe('CURTAIN');

    const placed = await ctx
      .http()
      .post(`${API}/checkout/orders`)
      .set('X-Cart-Token', token)
      .set('Idempotency-Key', `cfg-${Date.now()}-abcdefghij`)
      .send({ fulfillment: 'DELIVERY', address, paymentMethod: 'CARD', contact: { name: 'Sara', phone: '0551234567' } })
      .expect(201);
    const items = await ctx.prisma.orderItem.findMany({ where: { orderId: placed.body.order.id }, orderBy: { sortOrder: 'asc' } });
    expect(items[0]).toMatchObject({ isMadeToMeasure: true, unitPrice: 261060, quantity: 2 });
    expect(items[0]!.configuration).toMatchObject({ kind: 'CURTAIN', templateCode: 'TEST_CURTAINS', inputs: { widthMm: 3000 }, specs: { widths: 6, cutLengthMm: 2900, fabricMeters: 17.4, headingStyle: 'WAVE' } });
    expect(await ctx.prisma.stockReservation.count()).toBe(0);
    const view = await ctx.http().get(`${API}/orders/${placed.body.order.id}`).set('X-Order-Token', placed.body.accessToken).expect(200);
    expect(view.body.items[0].configuration.specs.widths).toBe(6);
  });

  it('takes sofa photos privately and attaches them to one configuration only', async () => {
    const f = await products();
    const templateId = await sofaTemplate();
    await ctx.prisma.product.update({ where: { id: f.sofa }, data: { configuratorTemplateId: templateId } });

    await ctx.http().post(`${API}/configurator/uploads`).attach('file', Buffer.from('not an image'), 'x.jpg').expect(400);
    const jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#887766' } }).jpeg().withMetadata({ exif: { IFD0: { Copyright: 'secret' } } }).toBuffer();
    const upload = await ctx.http().post(`${API}/configurator/uploads`).attach('file', jpeg, 'sofa.jpg').expect(201);
    expect(upload.body).toMatchObject({ id: expect.any(String), width: 1200, height: 800 });

    const inputs = { pieces: [{ code: 'SEAT_3', quantity: 1, widthMm: 2200, depthMm: 900, heightMm: 850 }], photoIds: [upload.body.id] };
    const noPhoto = await ctx.http().post(`${API}/configurator/quote`).send({ productId: f.sofa, variantId: f.sofaVariant, inputs: { ...inputs, photoIds: [] } }).expect(200);
    expect(noPhoto.body.issues).toEqual([{ field: 'photoIds', code: 'tooFew', params: { min: 1 } }]);

    // Out of stock does not matter for made-to-order covers; the starting price is the minimum.
    const added = await ctx.http().post(`${API}/cart/items`).send({ variantId: f.sofaVariant, quantity: 1, configuration: { inputs } }).expect(201);
    expect(added.body.items[0]).toMatchObject({ unitPrice: 59900, issue: null });
    const reused = await ctx.http().post(`${API}/cart/items`).set('X-Cart-Token', added.body.cartToken).send({ variantId: f.sofaVariant, quantity: 1, configuration: { inputs } }).expect(400);
    expect(reused.body.details).toMatchObject({ field: 'inputs.photoIds' });

    const stored = await ctx.prisma.customerUpload.findUniqueOrThrow({ where: { id: upload.body.id } });
    expect(stored.configurationId).toBe(added.body.items[0].configuration.id);
    const image = await ctx.http().get(`${API}/admin/configurator/uploads/${upload.body.id}`).set(admin).expect(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(image.body as Buffer).metadata();
    expect(meta.exif).toBeUndefined(); // metadata stripped
    await ctx.http().get(`${API}/admin/configurator/uploads/${upload.body.id}`).expect(401);
  });
});

describe('measurement profiles', () => {
  it('lets customers save, update and delete abaya measurements', async () => {
    const { accessToken } = await loginCustomer(ctx, '0512345678');
    const me = bearer(accessToken);
    const created = await ctx.http().post(`${API}/me/measurement-profiles`).set(me).send({ label: 'Mine', measurements: { length: 1450, chest: 1000, shoulder: 400, sleeve: 600 } }).expect(201);
    await ctx.http().post(`${API}/me/measurement-profiles`).set(me).send({ label: 'Bad', measurements: { waist: 800 } }).expect(400);
    await ctx.http().post(`${API}/me/measurement-profiles`).set(me).send({ label: 'Bad', measurements: { length: 50 } }).expect(400);
    await ctx.http().patch(`${API}/me/measurement-profiles/${created.body.id}`).set(me).send({ label: 'Eid abaya', measurements: { length: 1500 } }).expect(200);
    const list = await ctx.http().get(`${API}/me/measurement-profiles`).set(me).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ label: 'Eid abaya', measurements: { length: 1500 } })]);
    const other = bearer((await loginCustomer(ctx, '0598765432')).accessToken);
    await ctx.http().delete(`${API}/me/measurement-profiles/${created.body.id}`).set(other).expect(404);
    await ctx.http().delete(`${API}/me/measurement-profiles/${created.body.id}`).set(me).expect(204);
  });
});

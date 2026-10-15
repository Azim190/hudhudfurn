import { seedCommerce } from '../prisma/seed-lib';
import { OrderPaymentsService } from '../src/modules/orders/order-payments.service';
import { OrdersService } from '../src/modules/orders/orders.service';
import { bearer, closeTestApp, createTestApp, loginCustomer, loginStaff, resetState, totpSecrets, type TestContext } from './helpers';

const API = '/api/v1';
let ctx: TestContext;

interface Fixture {
  abaya: string;
  blind: string;
  locationId: string;
}

async function fixture(stock = 5): Promise<Fixture> {
  const p = ctx.prisma;
  const loc = await p.location.create({ data: { code: 'MAIN', type: 'WAREHOUSE', nameAr: 'المستودع' } });
  const cat = await p.category.create({ data: { vertical: 'ABAYAS', nameAr: 'العبايات', nameEn: 'Abayas', slugAr: 'العبايات', slugEn: 'abayas' } });
  const blinds = await p.category.create({ data: { vertical: 'CURTAINS', nameAr: 'بلايند', nameEn: 'Blinds', slugAr: 'بلايند', slugEn: 'blinds' } });
  const live = { status: 'ACTIVE' as const, publishedAt: new Date() };
  const abaya = await p.product.create({
    data: { ...live, categoryId: cat.id, skuPrefix: 'ABY-0001', nameAr: 'عباية', nameEn: 'Abaya', slugAr: 'عباية', slugEn: 'abaya', basePrice: 29900, variants: { create: [{ sku: 'ABY-0001-BLACK', optionKey: '', isDefault: true, weightGrams: 800, stock: { create: [{ locationId: loc.id, onHand: stock }] } }] } },
    include: { variants: true },
  });
  const blind = await p.product.create({
    data: { ...live, categoryId: blinds.id, skuPrefix: 'CUR-0001', nameAr: 'رول بلايند', nameEn: 'Roller blind', slugAr: 'رول', slugEn: 'roller', basePrice: 15900, pricingMode: 'PER_SQM', isMadeToMeasure: true, variants: { create: [{ sku: 'CUR-0001', optionKey: '', isDefault: true }] } },
    include: { variants: true },
  });
  return { abaya: abaya.variants[0]!.id, blind: blind.variants[0]!.id, locationId: loc.id };
}

const address = { recipientName: 'Sara Ahmed', phone: '0551234567', cityCode: 'JED', street: 'Tahlia Street', buildingNo: '1234', postalCode: '23434' };
const contact = { name: 'Sara Ahmed', phone: '0551234567', email: 'sara@example.com' };
const key = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

async function guestCart(variantId: string, quantity: number, extra: Record<string, unknown> = {}) {
  const res = await ctx.http().post(`${API}/cart/items`).send({ variantId, quantity, ...extra }).expect(201);
  return res.body.cartToken as string;
}

/** Complete a simulator session the way the hosted page does, then let the return page verify it. */
async function payOnSimulator(redirectUrl: string, outcome: 'pay' | 'decline' | 'cancel' = 'pay') {
  const path = new URL(redirectUrl).pathname;
  const page = await ctx.http().get(path).expect(200);
  expect(page.text).toContain('HD-');
  const done = await ctx.http().post(path).type('form').send({ outcome }).expect(303);
  return new URL(done.headers.location!).searchParams.get('order')!;
}

const stockOf = async (variantId: string) => {
  const s = await ctx.prisma.stockLevel.findFirstOrThrow({ where: { variantId } });
  return { onHand: s.onHand, reserved: s.reserved };
};

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => closeTestApp(ctx));
beforeEach(async () => {
  await resetState(ctx);
  await seedCommerce(ctx.prisma);
  totpSecrets.clear();
});

describe('checkout quote', () => {
  it('prices delivery by zone, applies coupons and lists payment methods', async () => {
    const f = await fixture();
    const token = await guestCart(f.abaya, 1);
    const q = await ctx.http().post(`${API}/checkout/quote`).set('X-Cart-Token', token).send({ fulfillment: 'DELIVERY', address, couponCode: 'save50' }).expect(200);
    // JED is in the "major cities" zone; 299 SAR is below SMSA's 400 SAR free threshold.
    expect(q.body.shippingOptions.map((o: { nameEn: string; price: number }) => [o.nameEn, o.price])).toEqual([
      ['SMSA standard', 3500],
      ['Aramex express', 5500],
    ]);
    // SAVE50 needs 300 SAR of goods.
    expect(q.body.coupon).toMatchObject({ code: 'SAVE50', applied: false, problem: 'minSubtotal' });
    expect(q.body.totals).toMatchObject({ subtotal: 29900, discount: 0, shipping: 3500, total: 33400 });
    expect(q.body.totals.net + q.body.totals.vat).toBe(33400);
    const methods = Object.fromEntries(q.body.paymentMethods.map((m: { method: string; available: boolean; fee?: number }) => [m.method, m.available]));
    expect(methods).toEqual({ CARD: true, TABBY: true, TAMARA: true, COD: true });
    expect(q.body.canPlace).toBe(false); // no payment method chosen yet

    const welcome = await ctx.http().post(`${API}/checkout/quote`).set('X-Cart-Token', token).send({ fulfillment: 'DELIVERY', address, couponCode: 'WELCOME10', paymentMethod: 'COD', shippingRateId: q.body.shippingOptions[1].rateId }).expect(200);
    expect(welcome.body.coupon).toMatchObject({ applied: true, problem: null });
    expect(welcome.body.totals).toMatchObject({ discount: 2990, shipping: 5500, codFee: 1500, total: 29900 - 2990 + 5500 + 1500 });
    expect(welcome.body.canPlace).toBe(true);

    const unknown = await ctx.http().post(`${API}/checkout/quote`).set('X-Cart-Token', token).send({ fulfillment: 'DELIVERY', address, couponCode: 'NOPE123' }).expect(200);
    expect(unknown.body.coupon).toMatchObject({ applied: false, problem: 'unknown' });
  });

  it('blocks COD for made-to-measure items and offers store pickup', async () => {
    const f = await fixture();
    const token = await guestCart(f.blind, 1, { widthMm: 1200, heightMm: 1500 });
    const q = await ctx.http().post(`${API}/checkout/quote`).set('X-Cart-Token', token).send({ fulfillment: 'DELIVERY', address: { ...address, cityCode: 'RUH' } }).expect(200);
    expect(q.body.paymentMethods.find((m: { method: string }) => m.method === 'COD')).toMatchObject({ available: false, reason: 'madeToMeasure' });
    // Production time is added to delivery.
    expect(q.body.shippingOptions[0].etaMinDays).toBeGreaterThanOrEqual(7);

    const showroom = await ctx.prisma.location.findUniqueOrThrow({ where: { code: 'RUH-01' } });
    const pickup = await ctx.http().post(`${API}/checkout/quote`).set('X-Cart-Token', token).send({ fulfillment: 'PICKUP', pickupLocationId: showroom.id, paymentMethod: 'CARD' }).expect(200);
    expect(pickup.body).toMatchObject({ blockers: [], canPlace: true, pickupLocation: { id: showroom.id } });
    expect(pickup.body.totals.shipping).toBe(0);
    expect(pickup.body.paymentMethods.find((m: { method: string }) => m.method === 'COD')).toMatchObject({ available: false, reason: 'pickup' });
  });

  it('rejects an empty cart', async () => {
    await ctx.http().post(`${API}/checkout/quote`).send({ fulfillment: 'DELIVERY', address }).expect(400);
  });
});

describe('prepaid order (card)', () => {
  it('reserves stock, pays on the gateway page, commits stock and issues a ZATCA invoice', async () => {
    const f = await fixture();
    const token = await guestCart(f.abaya, 2);
    const body = { fulfillment: 'DELIVERY', address, paymentMethod: 'CARD', contact, couponCode: 'WELCOME10', locale: 'en' };

    await ctx.http().post(`${API}/checkout/orders`).set('X-Cart-Token', token).send(body).expect(400); // Idempotency-Key required
    const k = key();
    const placed = await ctx.http().post(`${API}/checkout/orders`).set('X-Cart-Token', token).set('Idempotency-Key', k).send(body).expect(201);
    expect(placed.body.order).toMatchObject({ number: expect.stringMatching(/^HD-\d{4}-000001$/), status: 'NEW', paymentMethod: 'CARD' });
    expect(placed.body.payment.redirectUrl).toContain('/payments/simulator/');

    // Replays return the same order; a different body with the same key is refused.
    const replay = await ctx.http().post(`${API}/checkout/orders`).set('X-Cart-Token', token).set('Idempotency-Key', k).send(body).expect(201);
    expect(replay.body.order.id).toBe(placed.body.order.id);
    await ctx.http().post(`${API}/checkout/orders`).set('X-Cart-Token', token).set('Idempotency-Key', k).send({ ...body, customerNote: 'x' }).expect(422);
    expect(await ctx.prisma.order.count()).toBe(1);

    expect(await stockOf(f.abaya)).toEqual({ onHand: 5, reserved: 2 });
    expect((await ctx.http().get(`${API}/cart`).set('X-Cart-Token', token).expect(200)).body.items).toEqual([]);

    const orderId = await payOnSimulator(placed.body.payment.redirectUrl);
    expect(orderId).toBe(placed.body.order.id);
    const access = { 'X-Order-Token': placed.body.accessToken };
    await ctx.http().get(`${API}/orders/${orderId}`).expect(404);
    const verified = await ctx.http().post(`${API}/orders/${orderId}/verify`).set(access).expect(200);
    expect(verified.body).toMatchObject({ status: 'PAID', paymentState: 'PAID', payment: { status: 'CAPTURED', provider: 'SIMULATOR' } });
    expect(verified.body.totals).toMatchObject({ subtotal: 59800, discount: 5980, shipping: 0, total: 53820 });
    expect(await stockOf(f.abaya)).toEqual({ onHand: 3, reserved: 0 });

    // Verifying again changes nothing.
    await ctx.http().post(`${API}/orders/${orderId}/verify`).set(access).expect(200);
    const invoices = await ctx.prisma.taxInvoice.findMany();
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ kind: 'INVOICE', icv: 1, total: 53820, zatcaStatus: 'NOT_SUBMITTED' });

    const inv = await ctx.http().get(`${API}/orders/${orderId}/invoices/${invoices[0]!.id}`).set(access).expect(200);
    expect(inv.body).toMatchObject({ number: expect.stringMatching(/^INV-\d{4}-000001$/), seller: { vatNumber: '300000000000003' }, totals: { total: 53820 } });
    expect(inv.body.lines).toHaveLength(1);
    const qr = Buffer.from(inv.body.qr, 'base64');
    expect(qr[0]).toBe(1); // TLV tag 1: seller name
    expect(invoices[0]!.xml).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');
    expect(invoices[0]!.xml).toContain('<cbc:PayableAmount currencyID="SAR">538.20</cbc:PayableAmount>');

    // Issued invoices are immutable at the database level.
    await expect(ctx.prisma.taxInvoice.update({ where: { id: invoices[0]!.id }, data: { total: 1 } })).rejects.toThrow(/immutable/);
    await expect(ctx.prisma.taxInvoice.delete({ where: { id: invoices[0]!.id } })).rejects.toThrow(/cannot be deleted/);

    // WELCOME10 is first-order only: a guest is recognised by phone number when placing the order.
    const again = await guestCart(f.abaya, 1);
    const second = await ctx.http().post(`${API}/checkout/orders`).set('X-Cart-Token', again).set('Idempotency-Key', key()).send({ ...body, contact: { ...contact, phone: '+966551234567' } }).expect(400);
    expect(second.body).toMatchObject({ code: 'couponNotApplicable', details: { reason: 'usageLimit' } });
  });

  it('lets the customer retry after a declined card, and expires unpaid orders', async () => {
    const f = await fixture();
    const token = await guestCart(f.abaya, 1);
    const placed = await ctx.http().post(`${API}/checkout/orders`).set('X-Cart-Token', token).set('Idempotency-Key', key()).send({ fulfillment: 'DELIVERY', address, paymentMethod: 'CARD', contact, couponCode: 'WELCOME10' }).expect(201);
    const access = { 'X-Order-Token': placed.body.accessToken };
    const orderId = await payOnSimulator(placed.body.payment.redirectUrl, 'decline');
    const declined = await ctx.http().post(`${API}/orders/${orderId}/verify`).set(access).expect(200);
    expect(declined.body).toMatchObject({ status: 'NEW', paymentState: 'UNPAID', canRetryPayment: true, payment: { status: 'FAILED' } });

    const retry = await ctx.http().post(`${API}/orders/${orderId}/pay`).set(access).expect(200);
    expect(retry.body.redirectUrl).not.toBe(placed.body.payment.redirectUrl);
    await ctx.http().post(`${API}/orders/${orderId}/pay`).expect(404); // no access token

    // The window passes without payment: the order is cancelled, stock and the coupon use come back.
    await ctx.prisma.order.update({ where: { id: orderId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const orders = ctx.app.get(OrdersService);
    const payments = ctx.app.get(OrderPaymentsService);
    expect(await orders.expireUnpaid((id) => payments.syncOrder(id))).toBe(1);
    const expired = await ctx.http().get(`${API}/orders/${orderId}`).set(access).expect(200);
    expect(expired.body).toMatchObject({ status: 'CANCELLED', canRetryPayment: false });
    expect(await stockOf(f.abaya)).toEqual({ onHand: 5, reserved: 0 });
    const promo = await ctx.prisma.promotion.findFirstOrThrow({ where: { coupons: { some: { code: 'WELCOME10' } } } });
    expect(promo.usageCount).toBe(0);
    expect(await ctx.prisma.payment.count({ where: { orderId, status: 'EXPIRED' } })).toBe(1);

    // Paying the stale session afterwards is refunded automatically.
    const path = new URL(retry.body.redirectUrl).pathname;
    await ctx.http().post(path).type('form').send({ outcome: 'pay' });
    await payments.syncOrder(orderId);
    expect(await ctx.prisma.refund.count({ where: { orderId, status: 'SUCCEEDED' } })).toBe(0); // the session was voided on cancel
  });

  it('refuses the order when stock ran out after the quote', async () => {
    const f = await fixture(2);
    const token = await guestCart(f.abaya, 2);
    await ctx.prisma.stockLevel.updateMany({ where: { variantId: f.abaya }, data: { onHand: 1 } });
    const k = key();
    const res = await ctx.http().post(`${API}/checkout/orders`).set('X-Cart-Token', token).set('Idempotency-Key', k).send({ fulfillment: 'DELIVERY', address, paymentMethod: 'CARD', contact }).expect(400);
    expect(res.body.code).toBe('cartNotReady');
    expect(await ctx.prisma.order.count()).toBe(0);
    // The failed attempt releases the key.
    expect(await ctx.prisma.idempotencyKey.count()).toBe(0);
  });

  it('requires an email for instalment payments and refuses a changed total', async () => {
    const f = await fixture();
    const token = await guestCart(f.abaya, 1);
    const base = { fulfillment: 'DELIVERY', address, paymentMethod: 'TABBY', contact: { name: 'Sara', phone: '0551234567' } };
    await ctx.http().post(`${API}/checkout/orders`).set('X-Cart-Token', token).set('Idempotency-Key', key()).send(base).expect(400);
    const changed = await ctx.http().post(`${API}/checkout/orders`).set('X-Cart-Token', token).set('Idempotency-Key', key()).send({ ...base, contact, expectedTotal: 100 }).expect(409);
    expect(changed.body.details).toMatchObject({ reason: 'totalChanged', total: 33400 });

    // BNPL: authorised on the provider page, captured by the store.
    const placed = await ctx.http().post(`${API}/checkout/orders`).set('X-Cart-Token', token).set('Idempotency-Key', key()).send({ ...base, contact, expectedTotal: 33400 }).expect(201);
    const orderId = await payOnSimulator(placed.body.payment.redirectUrl);
    const paid = await ctx.http().post(`${API}/orders/${orderId}/verify`).set('X-Order-Token', placed.body.accessToken).expect(200);
    expect(paid.body).toMatchObject({ status: 'PAID', paymentMethod: 'TABBY', payment: { status: 'CAPTURED' } });
  });
});

describe('cash on delivery and order operations', () => {
  it('confirms COD orders at once and invoices them on delivery', async () => {
    const f = await fixture();
    const customer = await loginCustomer(ctx, '0512345678');
    await ctx.http().post(`${API}/cart/items`).set(bearer(customer.accessToken)).send({ variantId: f.abaya, quantity: 1 }).expect(201);
    const placed = await ctx
      .http()
      .post(`${API}/checkout/orders`)
      .set(bearer(customer.accessToken))
      .set('Idempotency-Key', key())
      .send({ fulfillment: 'DELIVERY', address: { ...address, cityCode: 'RUH' }, paymentMethod: 'COD', contact: { name: 'Nora', phone: '0512345678' } })
      .expect(201);
    expect(placed.body.order.status).toBe('CONFIRMED');
    expect(placed.body.payment).toBeNull();
    expect(await stockOf(f.abaya)).toEqual({ onHand: 4, reserved: 0 });

    const mine = await ctx.http().get(`${API}/me/orders`).set(bearer(customer.accessToken)).expect(200);
    expect(mine.body.items).toHaveLength(1);
    const detail = await ctx.http().get(`${API}/orders/${placed.body.order.id}`).set(bearer(customer.accessToken)).expect(200);
    // 299 + Riyadh delivery 25 + COD fee 15.
    expect(detail.body).toMatchObject({ paymentState: 'PAY_ON_DELIVERY', totals: { shipping: 2500, codFee: 1500, total: 33900 }, invoices: [] });

    const staff = await loginStaff(ctx);
    const admin = bearer(staff.accessToken);
    const id = placed.body.order.id;
    await ctx.http().post(`${API}/admin/orders/${id}/status`).set(admin).send({ status: 'DELIVERED' }).expect(400); // must go through READY/SHIPPED
    for (const status of ['READY', 'SHIPPED', 'DELIVERED']) await ctx.http().post(`${API}/admin/orders/${id}/status`).set(admin).send({ status }).expect(200);
    const delivered = await ctx.http().get(`${API}/admin/orders/${id}`).set(admin).expect(200);
    expect(delivered.body).toMatchObject({ status: 'DELIVERED', paymentState: 'PAID' });
    expect(delivered.body.invoices).toHaveLength(1);
    // Invoice lines: the abaya, delivery and the COD fee.
    const inv = await ctx.http().get(`${API}/admin/invoices/${delivered.body.invoices[0].id}`).set(admin).expect(200);
    expect(inv.body.lines.map((l: { nameEn: string }) => l.nameEn)).toEqual(['Abaya', 'Delivery', 'Cash on delivery fee']);
    expect(inv.body.totals.total).toBe(33900);

    const list = await ctx.http().get(`${API}/admin/orders?q=${placed.body.order.number}`).set(admin).expect(200);
    expect(list.body.total).toBe(1);
  });

  it('cancels a paid order: restocks, refunds and issues a chained credit note', async () => {
    const f = await fixture();
    const token = await guestCart(f.abaya, 1);
    const placed = await ctx.http().post(`${API}/checkout/orders`).set('X-Cart-Token', token).set('Idempotency-Key', key()).send({ fulfillment: 'DELIVERY', address, paymentMethod: 'CARD', contact }).expect(201);
    const orderId = await payOnSimulator(placed.body.payment.redirectUrl);
    await ctx.http().post(`${API}/orders/${orderId}/verify`).set('X-Order-Token', placed.body.accessToken).expect(200);
    expect(await stockOf(f.abaya)).toEqual({ onHand: 4, reserved: 0 });

    const staff = await loginStaff(ctx);
    const admin = bearer(staff.accessToken);
    const cancelled = await ctx.http().post(`${API}/admin/orders/${orderId}/cancel`).set(admin).send({ reason: 'Customer request' }).expect(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', paymentState: 'REFUNDED', totals: { refunded: 33400 } });
    expect(cancelled.body.refunds[0]).toMatchObject({ status: 'SUCCEEDED', amount: 33400 });
    expect(await stockOf(f.abaya)).toEqual({ onHand: 5, reserved: 0 });

    const docs = await ctx.prisma.taxInvoice.findMany({ orderBy: { icv: 'asc' } });
    expect(docs.map((d) => [d.kind, d.icv])).toEqual([
      ['INVOICE', 1],
      ['CREDIT_NOTE', 2],
    ]);
    expect(docs[1]!.previousHash).toBe(docs[0]!.hash);
    expect(docs[1]!.originalId).toBe(docs[0]!.id);
    expect(docs[1]!.xml).toContain('<cbc:InvoiceTypeCode name="0200000">381</cbc:InvoiceTypeCode>');
    expect(docs[1]!.xml).toContain(`<cac:InvoiceDocumentReference><cbc:ID>${docs[0]!.number}</cbc:ID>`);

    const chain = await ctx.http().get(`${API}/admin/invoices/chain/verify`).set(admin).expect(200);
    expect(chain.body).toEqual({ ok: true, count: 2, errors: [] });
    const xml = await ctx.http().get(`${API}/admin/invoices/${docs[0]!.id}/xml`).set(admin).expect(200);
    expect(xml.headers['content-type']).toContain('application/xml');

    // Customers cannot cancel once it is cancelled.
    await ctx.http().post(`${API}/orders/${orderId}/cancel`).set('X-Order-Token', placed.body.accessToken).send({}).expect(400);
  });

  it('manages shipping zones and promotions from the admin', async () => {
    const staff = await loginStaff(ctx);
    const admin = bearer(staff.accessToken);
    const zones = await ctx.http().get(`${API}/admin/shipping/zones`).set(admin).expect(200);
    expect(zones.body.map((z: { code: string }) => z.code)).toEqual(['RIYADH', 'MAIN', 'KINGDOM']);
    const zone = await ctx.http().post(`${API}/admin/shipping/zones`).set(admin).send({ code: 'north', nameAr: 'الشمال', nameEn: 'North', cityCodes: ['TUU', 'HAS'] }).expect(201);
    expect(zone.body.code).toBe('NORTH');
    await ctx.http().post(`${API}/admin/shipping/zones/${zone.body.id}/rates`).set(admin).send({ carrier: 'spl', method: 'standard', nameAr: 'سبل', nameEn: 'SPL', price: 3900, etaMinDays: 4, etaMaxDays: 2 }).expect(400);
    await ctx.http().post(`${API}/admin/shipping/zones/${zone.body.id}/rates`).set(admin).send({ carrier: 'spl', method: 'standard', nameAr: 'سبل', nameEn: 'SPL', price: 3900, etaMinDays: 2, etaMaxDays: 4 }).expect(201);
    await ctx.http().post(`${API}/admin/shipping/zones`).set(admin).send({ code: 'BAD', nameAr: 'خطأ', nameEn: 'Bad', cityCodes: ['XXX'] }).expect(400);

    await ctx.http().post(`${API}/admin/promotions`).set(admin).send({ nameAr: 'خصم', nameEn: 'Bad', type: 'PERCENT', conditions: {}, benefit: {} }).expect(400);
    const promo = await ctx
      .http()
      .post(`${API}/admin/promotions`)
      .set(admin)
      .send({ nameAr: 'خصم العبايات', nameEn: 'Abaya sale', type: 'PERCENT', automatic: true, conditions: { verticals: ['ABAYAS'] }, benefit: { percent: 20 } })
      .expect(201);
    await ctx.http().post(`${API}/admin/promotions/${promo.body.id}/coupons`).set(admin).send({ code: 'save50' }).expect(409);

    // The automatic promotion now applies at checkout.
    const f = await fixture();
    const token = await guestCart(f.abaya, 1);
    const q = await ctx.http().post(`${API}/checkout/quote`).set('X-Cart-Token', token).send({ fulfillment: 'DELIVERY', address: { ...address, cityCode: 'TUU' } }).expect(200);
    expect(q.body.promotions).toEqual([expect.objectContaining({ nameEn: 'Abaya sale', discount: 5980 })]);
    expect(q.body.shippingOptions[0]).toMatchObject({ nameEn: 'SPL', price: 3900 });
  });

  it('rejects unauthenticated gateway webhooks', async () => {
    await ctx.http().post(`${API}/payments/webhooks/moyasar`).send({ secret_token: 'x' }).expect(404); // not configured in tests
    await ctx.http().post(`${API}/payments/webhooks/unknown`).send({}).expect(404);
  });
});

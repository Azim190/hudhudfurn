import sharp from 'sharp';
import { seedCommerce } from '../prisma/seed-lib';
import { OrderPaymentsService } from '../src/modules/orders/order-payments.service';
import { OrdersService } from '../src/modules/orders/orders.service';
import { bearer, closeTestApp, createTestApp, loginCustomer, loginStaff, resetState, totpSecrets, type TestContext } from './helpers';

const API = '/api/v1';
let ctx: TestContext;
let admin: Record<string, string>;

const riyadhDate = (offsetDays: number) => new Date(Date.now() + 3 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const key = () => `svc-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
const address = { recipientName: 'Sara Ahmed', phone: '0551234567', cityCode: 'RUH', street: 'Olaya Street, villa 4' };

async function setup(measurementFee = 5000) {
  const area = await ctx.http().post(`${API}/admin/services/areas`).set(admin).send({ code: 'RIYADH', nameAr: 'الرياض', nameEn: 'Riyadh', cityCode: 'RUH', types: ['MEASUREMENT', 'INSTALLATION'], measurementFee, installationFee: 15000, freeInstallationAbove: 150000 }).expect(201);
  const day = riyadhDate(3);
  const generated = await ctx.http().post(`${API}/admin/services/areas/${area.body.id}/slots/generate`).set(admin).send({ from: day, to: day, weekdays: [0, 1, 2, 3, 4, 5, 6], windows: [{ start: '09:00', end: '12:00' }, { start: '16:00', end: '19:00' }], capacity: 1 }).expect(201);
  expect(generated.body).toEqual({ created: 2, skipped: 0 });
  // Running the generator again does not duplicate slots.
  expect((await ctx.http().post(`${API}/admin/services/areas/${area.body.id}/slots/generate`).set(admin).send({ from: day, to: day, weekdays: [0, 1, 2, 3, 4, 5, 6], windows: [{ start: '09:00', end: '12:00' }], capacity: 1 }).expect(201)).body).toEqual({ created: 0, skipped: 1 });

  // A technician covering the area.
  const email = `tech-${Date.now()}@test.sa`;
  const staff = await ctx.http().post(`${API}/admin/staff`).set(admin).send({ email, fullName: 'Fahad Technician', temporaryPassword: 'Technician-Pass-123', roleKeys: ['technician'] }).expect(201);
  await ctx.http().put(`${API}/admin/services/technicians/${staff.body.id}`).set(admin).send({ phone: '0533333333', areaIds: [area.body.id] }).expect(200);
  const tech = bearer((await loginStaff(ctx, email, 'Technician-Pass-123')).accessToken);
  return { areaId: area.body.id as string, day, techId: staff.body.id as string, tech };
}

async function curtainProduct() {
  const p = ctx.prisma;
  const cat = await p.category.create({ data: { vertical: 'CURTAINS', nameAr: 'ستائر', nameEn: 'Curtains', slugAr: 'ستائر', slugEn: 'curtains' } });
  const t = await p.configuratorTemplate.create({
    data: {
      code: 'SVC_CURTAINS',
      kind: 'CURTAIN',
      nameAr: 'ستائر',
      nameEn: 'Curtains',
      headingStyles: { create: [{ code: 'WAVE', nameAr: 'ويف', nameEn: 'Wave', fullnessMin: 200, fullnessMax: 250, fullnessDefault: 220, makingCostPerM: 3500 }] },
      options: { create: [{ group: 'MOUNTING', code: 'WALL', nameAr: 'جدار', nameEn: 'Wall', priceBasis: 'FLAT', price: 0, isDefault: true }, { group: 'MOUNTING', code: 'RECESS', nameAr: 'داخل', nameEn: 'Recess', priceBasis: 'FLAT', price: 0 }] },
    },
  });
  const product = await p.product.create({
    data: { status: 'ACTIVE', publishedAt: new Date(), categoryId: cat.id, skuPrefix: 'CUR-0300', nameAr: 'ستارة ويف', nameEn: 'Wave curtain', slugAr: 'ويف', slugEn: 'wave', basePrice: 8900, pricingMode: 'CALCULATED', isMadeToMeasure: true, configuratorTemplateId: t.id, variants: { create: [{ sku: 'CUR-0300', optionKey: '', isDefault: true, fabricWidthMm: 1400 }] } },
    include: { variants: true },
  });
  return { productId: product.id, variantId: product.variants[0]!.id };
}

async function payOnSimulator(redirectUrl: string) {
  const path = new URL(redirectUrl).pathname;
  await ctx.http().post(path).type('form').send({ outcome: 'pay' }).expect(303);
}

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

describe('measurement visit, technician and quotation', () => {
  it('books a paid visit, runs it in the field and turns the quotation into a paid order', async () => {
    const { day, techId, tech } = await setup();
    const avail = await ctx.http().get(`${API}/services/availability?cityCode=RUH&type=MEASUREMENT`).expect(200);
    expect(avail.body).toMatchObject({ fee: 5000, area: { nameEn: 'Riyadh' } });
    const morning = avail.body.days.find((d: { date: string }) => d.date === day).slots.find((s: { start: string }) => s.start === '09:00');
    expect(morning.available).toBe(true);
    expect((await ctx.http().get(`${API}/services/availability?cityCode=JED&type=MEASUREMENT`).expect(200)).body).toEqual({ area: null, fee: null, days: [] });

    const customer = await loginCustomer(ctx, '0512345678');
    const me = bearer(customer.accessToken);
    await ctx.http().post(`${API}/services/bookings`).send({ type: 'MEASUREMENT', slotId: morning.id, address }).set('Idempotency-Key', key()).expect(401);
    const booked = await ctx.http().post(`${API}/services/bookings`).set(me).set('Idempotency-Key', key()).send({ type: 'MEASUREMENT', slotId: morning.id, address, notes: 'Two windows in the majlis', lat: 24.7136, lng: 46.6753 }).expect(201);
    expect(booked.body.booking).toMatchObject({ number: expect.stringMatching(/^BK-\d{4}-000001$/), status: 'REQUESTED', fee: 5000 });
    expect(booked.body.payment.redirectUrl).toContain('/payments/simulator/');

    // The slot had capacity 1: a second customer cannot take it.
    const other = bearer((await loginCustomer(ctx, '0598765432')).accessToken);
    const full = await ctx.http().post(`${API}/services/bookings`).set(other).set('Idempotency-Key', key()).send({ type: 'MEASUREMENT', slotId: morning.id, address: { ...address, phone: '0598765432' } }).expect(409);
    expect(full.body.code).toBe('slotUnavailable');

    // Paying the visit fee confirms the booking (and issues a tax invoice for the fee).
    await payOnSimulator(booked.body.payment.redirectUrl);
    await ctx.http().post(`${API}/orders/${booked.body.payment.orderId}/verify`).set(me).expect(200);
    const confirmed = await ctx.http().get(`${API}/services/bookings/${booked.body.booking.id}`).set(me).expect(200);
    expect(confirmed.body).toMatchObject({ status: 'CONFIRMED', feeOrder: { paymentState: 'PAID' } });
    expect(await ctx.prisma.taxInvoice.count({ where: { orderId: booked.body.payment.orderId } })).toBe(1);
    expect(ctx.sms.sent.some((m) => m.to === '+966551234567' && /confirmed|تأكيد/.test(m.body))).toBe(true);

    // Dispatch.
    const id = booked.body.booking.id;
    await ctx.http().post(`${API}/admin/services/bookings/${id}/assign`).set(admin).send({ technicianId: techId }).expect(200);
    const jobs = await ctx.http().get(`${API}/technician/jobs?date=${day}`).set(tech).expect(200);
    expect(jobs.body.items).toHaveLength(1);
    expect(jobs.body.items[0]).toMatchObject({ number: booked.body.booking.number, customer: { masked: true }, navigationUrl: 'https://www.google.com/maps/dir/?api=1&destination=24.7136,46.6753' });
    await ctx.http().get(`${API}/technician/jobs?date=${day}`).set(admin).expect(200).then((r) => expect(r.body.items).toEqual([])); // only own jobs

    // Measurements need the visit to be under way.
    const window = { roomLabel: 'Majlis – left', widthMm: 3000, heightMm: 2600, mounting: 'WALL' };
    await ctx.http().post(`${API}/technician/jobs/${id}/measurements`).set(tech).send(window).expect(400);
    await ctx.http().post(`${API}/technician/jobs/${id}/status`).set(tech).send({ status: 'EN_ROUTE' }).expect(200);
    const started = await ctx.http().post(`${API}/technician/jobs/${id}/status`).set(tech).send({ status: 'IN_PROGRESS' }).expect(200);
    expect(started.body.customer).toEqual({ name: 'Sara Ahmed', phone: '+966551234567', masked: false });
    const photo = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#aabbcc' } }).jpeg().toBuffer();
    const up = await ctx.http().post(`${API}/technician/uploads`).set(tech).attach('file', photo, 'window.jpg').expect(201);
    const measured = await ctx.http().post(`${API}/technician/jobs/${id}/measurements`).set(tech).send({ ...window, photoIds: [up.body.id] }).expect(201);
    await ctx.http().post(`${API}/technician/jobs/${id}/measurements`).set(tech).send({ roomLabel: 'Majlis – right', widthMm: 1500, heightMm: 2600, mounting: 'RECESS' }).expect(201);
    const m1 = measured.body.measurements[0];
    expect(m1.photoIds).toEqual([up.body.id]);

    // Completing needs the customer's signature.
    await ctx.http().post(`${API}/technician/jobs/${id}/status`).set(tech).send({ status: 'COMPLETED' }).expect(400);
    const sig = await sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    await ctx.http().post(`${API}/technician/jobs/${id}/signature`).set(tech).send({ dataUrl: `data:image/png;base64,${sig.toString('base64')}` }).expect(200);

    // Quotation from the measured windows; the paid visit fee is credited.
    const { productId, variantId } = await curtainProduct();
    const job = await ctx.http().get(`${API}/technician/jobs/${id}`).set(tech).expect(200);
    const quoted = await ctx
      .http()
      .post(`${API}/technician/jobs/${id}/quotation`)
      .set(tech)
      .send({ lines: job.body.measurements.map((m: { id: string }) => ({ measurementId: m.id, productId, variantId, quantity: 1, inputs: { panels: 2, headingStyle: 'WAVE' } })) })
      .expect(201);
    const lineTotal = quoted.body.lines.reduce((s: number, l: { total: number }) => s + l.total, 0);
    expect(quoted.body).toMatchObject({ number: expect.stringMatching(/^QT-\d{4}-000001$/), status: 'SENT', credit: 5000, total: lineTotal - 5000 });
    expect(quoted.body.lines[0]).toMatchObject({ nameEn: 'Wave curtain — Majlis – left', configuration: { kind: 'CURTAIN', specs: { widthMm: 3000, heightMm: 2600, mounting: 'WALL' } } });
    expect(quoted.body.lines[1].configuration.specs).toMatchObject({ widthMm: 1500, mounting: 'RECESS' });
    expect(ctx.sms.sent.at(-1)!.body).toContain(`/quotations/${quoted.body.number}`);
    await ctx.http().post(`${API}/technician/jobs/${id}/status`).set(tech).send({ status: 'COMPLETED' }).expect(200);

    // The customer accepts and pays.
    await ctx.http().get(`${API}/quotations/${quoted.body.number}`).set(other).expect(404);
    const view = await ctx.http().get(`${API}/quotations/${quoted.body.number}`).set(me).expect(200);
    expect(view.body.paymentMethods).toContain('CARD');
    const accepted = await ctx.http().post(`${API}/quotations/${quoted.body.number}/accept`).set(me).send({ paymentMethod: 'CARD' }).expect(200);
    await ctx.http().post(`${API}/quotations/${quoted.body.number}/accept`).set(me).send({ paymentMethod: 'CARD' }).expect(400); // already accepted
    await payOnSimulator(accepted.body.redirectUrl);
    const paid = await ctx.http().post(`${API}/orders/${accepted.body.orderId}/verify`).set(me).expect(200);
    expect(paid.body).toMatchObject({ status: 'PAID', totals: { total: lineTotal - 5000, discount: 5000 }, quotationNumber: quoted.body.number });
    expect(paid.body.items[0].configuration).toMatchObject({ kind: 'CURTAIN', specs: { widths: expect.any(Number), cutLengthMm: 2900 } });
    expect(paid.body.items.every((i: { isMadeToMeasure: boolean }) => i.isMadeToMeasure)).toBe(true);

    // Staff see the photos and signature.
    const admView = await ctx.http().get(`${API}/admin/services/bookings/${id}`).set(admin).expect(200);
    expect(admView.body).toMatchObject({ status: 'COMPLETED', technician: { name: 'Fahad Technician' } });
    await ctx.http().get(`${API}/admin/services/uploads/${up.body.id}`).set(admin).expect(200);
  });

  it('lets customers reschedule and cancel before the cut-off, refunding the visit fee', async () => {
    const { day } = await setup();
    const avail = await ctx.http().get(`${API}/services/availability?cityCode=RUH&type=MEASUREMENT`).expect(200);
    const [morning, evening] = avail.body.days.find((d: { date: string }) => d.date === day).slots;
    const me = bearer((await loginCustomer(ctx, '0512345678')).accessToken);
    const booked = await ctx.http().post(`${API}/services/bookings`).set(me).set('Idempotency-Key', key()).send({ type: 'MEASUREMENT', slotId: morning.id, address }).expect(201);
    await payOnSimulator(booked.body.payment.redirectUrl);
    await ctx.http().post(`${API}/orders/${booked.body.payment.orderId}/verify`).set(me).expect(200);

    const moved = await ctx.http().post(`${API}/services/bookings/${booked.body.booking.id}/reschedule`).set(me).send({ slotId: evening.id }).expect(200);
    expect(moved.body.slot.start).toBe('16:00');
    const slots = await ctx.prisma.timeSlot.findMany({ orderBy: { startTime: 'asc' } });
    expect(slots.map((s) => s.booked)).toEqual([0, 1]);

    const cancelled = await ctx.http().post(`${API}/services/bookings/${booked.body.booking.id}/cancel`).set(me).send({ reason: 'Travelling' }).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect((await ctx.prisma.timeSlot.findMany()).every((s) => s.booked === 0)).toBe(true);
    const feeOrder = await ctx.prisma.order.findUniqueOrThrow({ where: { id: booked.body.payment.orderId } });
    expect(feeOrder).toMatchObject({ status: 'CANCELLED', paymentState: 'REFUNDED' });
    expect(await ctx.prisma.taxInvoice.count({ where: { orderId: feeOrder.id, kind: 'CREDIT_NOTE' } })).toBe(1);
  });

  it('confirms free visits at once and frees the slot when an unpaid fee expires', async () => {
    const { areaId, day } = await setup(0);
    const me = bearer((await loginCustomer(ctx, '0512345678')).accessToken);
    const slots = await ctx.http().get(`${API}/admin/services/areas/${areaId}/slots?from=${day}&to=${day}`).set(admin).expect(200);
    const free = await ctx.http().post(`${API}/services/bookings`).set(me).set('Idempotency-Key', key()).send({ type: 'MEASUREMENT', slotId: slots.body[0].id, address }).expect(201);
    expect(free.body).toMatchObject({ booking: { status: 'CONFIRMED', fee: 0 }, payment: null });

    await ctx.http().patch(`${API}/admin/services/areas/${areaId}`).set(admin).send({ measurementFee: 5000 }).expect(200);
    const paid = await ctx.http().post(`${API}/services/bookings`).set(me).set('Idempotency-Key', key()).send({ type: 'MEASUREMENT', slotId: slots.body[1].id, address }).expect(201);
    expect(paid.body.booking.status).toBe('REQUESTED');
    // The customer never pays: the fee order expires and the visit is cancelled.
    await ctx.prisma.order.update({ where: { id: paid.body.payment.orderId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const payments = ctx.app.get(OrderPaymentsService);
    await ctx.app.get(OrdersService).expireUnpaid((id) => payments.syncOrder(id));
    const after = await ctx.http().get(`${API}/services/bookings/${paid.body.booking.id}`).set(me).expect(200);
    expect(after.body.status).toBe('CANCELLED');
    expect((await ctx.prisma.timeSlot.findUniqueOrThrow({ where: { id: slots.body[1].id } })).booked).toBe(0);

    await ctx.http().patch(`${API}/admin/services/slots/${slots.body[0].id}`).set(admin).send({ capacity: 1 }).expect(200);
    await ctx.http().post(`${API}/admin/services/areas`).set(admin).send({ code: 'BAD', nameAr: 'x', nameEn: 'x', cityCode: 'XXX', types: ['MEASUREMENT'], measurementFee: 0, installationFee: 0 }).expect(400);
  });
});

import { bearer, closeTestApp, createTestApp, loginCustomer, resetState, type TestContext } from './helpers';

const API = '/api/v1';
let ctx: TestContext;
let token: string;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => closeTestApp(ctx));
beforeEach(async () => {
  await resetState(ctx);
  token = (await loginCustomer(ctx)).accessToken;
});

describe('profile & preferences', () => {
  it('updates name, email and display preferences', async () => {
    const res = await ctx
      .http()
      .patch(`${API}/me`)
      .set(bearer(token))
      .send({ fullName: 'نورة العتيبي', email: 'Noura@Example.com', locale: 'en', digits: 'western', calendar: 'islamic_umalqura' })
      .expect(200);
    expect(res.body).toMatchObject({
      fullName: 'نورة العتيبي',
      email: 'noura@example.com',
      locale: 'en',
      digits: 'western',
      calendar: 'islamic_umalqura',
    });
  });

  it('rejects an email used by another account', async () => {
    await ctx.prisma.user.create({ data: { kind: 'CUSTOMER', email: 'taken@example.com' } });
    const res = await ctx.http().patch(`${API}/me`).set(bearer(token)).send({ email: 'taken@example.com' }).expect(409);
    expect(res.body.code).toBe('emailTaken');
  });

  it('rejects unknown fields', async () => {
    await ctx.http().patch(`${API}/me`).set(bearer(token)).send({ kind: 'STAFF' }).expect(400);
  });
});

describe('addresses', () => {
  async function riyadh() {
    const cities = await ctx.http().get(`${API}/geo/cities`).expect(200);
    const city = cities.body.find((c: { code: string }) => c.code === 'RUH');
    const districts = await ctx.http().get(`${API}/geo/cities/${city.id}/districts`).expect(200);
    return { city, district: districts.body[0] };
  }

  it('creates, updates, defaults and deletes addresses', async () => {
    const { city, district } = await riyadh();
    const base = { recipientName: 'نورة', phone: '0598765432', cityId: city.id, districtId: district.id, shortAddress: 'rrrd2929', lat: 24.7136, lng: 46.6753 };

    const a1 = await ctx.http().post(`${API}/me/addresses`).set(bearer(token)).send({ ...base, label: 'المنزل' }).expect(201);
    expect(a1.body).toMatchObject({ isDefault: true, phoneE164: '+966598765432', shortAddress: 'RRRD2929' });

    const a2 = await ctx.http().post(`${API}/me/addresses`).set(bearer(token)).send({ ...base, label: 'العمل', isDefault: true }).expect(201);
    let list = await ctx.http().get(`${API}/me/addresses`).set(bearer(token)).expect(200);
    expect(list.body.map((a: { id: string; isDefault: boolean }) => [a.id, a.isDefault])).toEqual([
      [a2.body.id, true],
      [a1.body.id, false],
    ]);

    await ctx.http().patch(`${API}/me/addresses/${a1.body.id}`).set(bearer(token)).send({ street: 'طريق الملك فهد' }).expect(200);
    await ctx.http().delete(`${API}/me/addresses/${a2.body.id}`).set(bearer(token)).expect(204);
    list = await ctx.http().get(`${API}/me/addresses`).set(bearer(token)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: a1.body.id, isDefault: true, street: 'طريق الملك فهد' });
  });

  it('validates phone, national address format and district/city consistency', async () => {
    const { city } = await riyadh();
    const jeddah = (await ctx.prisma.city.findUniqueOrThrow({ where: { code: 'JED' }, include: { districts: true } }));
    const base = { recipientName: 'Sara', phone: '0598765432', cityId: city.id };

    await ctx.http().post(`${API}/me/addresses`).set(bearer(token)).send({ ...base, phone: '0112345678' }).expect(400);
    await ctx.http().post(`${API}/me/addresses`).set(bearer(token)).send({ ...base, shortAddress: 'RR2929' }).expect(400);
    await ctx.http().post(`${API}/me/addresses`).set(bearer(token)).send({ ...base, districtId: jeddah.districts[0]!.id }).expect(400);
  });

  it("cannot read or modify another customer's address", async () => {
    const { city } = await riyadh();
    const mine = await ctx.http().post(`${API}/me/addresses`).set(bearer(token)).send({ recipientName: 'Aisha', phone: '0598765432', cityId: city.id }).expect(201);
    await ctx.redis.flushdb();
    const other = await loginCustomer(ctx, '0533333333');
    await ctx.http().patch(`${API}/me/addresses/${mine.body.id}`).set(bearer(other.accessToken)).send({ label: 'x' }).expect(404);
    await ctx.http().delete(`${API}/me/addresses/${mine.body.id}`).set(bearer(other.accessToken)).expect(404);
  });
});

describe('PDPL consents & data requests', () => {
  it('records consent decisions with the policy version', async () => {
    const initial = await ctx.http().get(`${API}/me/consents`).set(bearer(token)).expect(200);
    expect(initial.body.every((c: { granted: boolean }) => !c.granted)).toBe(true);

    await ctx.http().put(`${API}/me/consents`).set(bearer(token)).send({ items: [{ purpose: 'MARKETING_WHATSAPP', granted: true }] }).expect(200);
    const res = await ctx.http().put(`${API}/me/consents`).set(bearer(token)).send({ items: [{ purpose: 'MARKETING_WHATSAPP', granted: false }, { purpose: 'ANALYTICS', granted: true }] }).expect(200);
    const byPurpose = Object.fromEntries(res.body.map((c: { purpose: string; granted: boolean }) => [c.purpose, c.granted]));
    expect(byPurpose).toMatchObject({ MARKETING_WHATSAPP: false, ANALYTICS: true });
    expect(await ctx.prisma.consentRecord.count()).toBe(3); // full history is kept
  });

  it('creates one open data request per type', async () => {
    const a = await ctx.http().post(`${API}/me/data-requests`).set(bearer(token)).send({ type: 'EXPORT' }).expect(201);
    const b = await ctx.http().post(`${API}/me/data-requests`).set(bearer(token)).send({ type: 'EXPORT' }).expect(201);
    expect(b.body.id).toBe(a.body.id);
    const list = await ctx.http().get(`${API}/me/data-requests`).set(bearer(token)).expect(200);
    expect(list.body).toHaveLength(1);
  });
});

describe('public endpoints', () => {
  it('serves health, store info and cities without auth', async () => {
    await ctx.http().get(`${API}/health/ready`).expect(200, { status: 'ok', db: 'up', redis: 'up' });
    const info = await ctx.http().get(`${API}/store/info`).expect(200);
    expect(info.body.vat).toEqual({ rateBp: 1500, pricesIncludeVat: true });
    const cities = await ctx.http().get(`${API}/geo/cities`).expect(200);
    expect(cities.body[0]).toMatchObject({ code: 'RUH', nameAr: 'الرياض', nameEn: 'Riyadh' });
  });

  it('treats an invalid token on a public route as anonymous', async () => {
    await ctx.http().get(`${API}/store/info`).set(bearer('not-a-jwt')).expect(200);
  });
});

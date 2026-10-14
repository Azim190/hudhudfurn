import { authenticator } from 'otplib';
import {
  bearer,
  closeTestApp,
  createTestApp,
  loginCustomer,
  loginStaff,
  OWNER,
  resetState,
  totpSecrets,
  type TestContext,
} from './helpers';

const API = '/api/v1';
let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => closeTestApp(ctx));
beforeEach(async () => {
  await resetState(ctx);
  totpSecrets.clear();
});

describe('customer OTP login', () => {
  it('creates a customer on first login and signs in again later', async () => {
    const first = await loginCustomer(ctx, '0512345678');
    expect(first.isNewUser).toBe(true);

    const me = await ctx.http().get(`${API}/me`).set(bearer(first.accessToken)).expect(200);
    expect(me.body).toMatchObject({ kind: 'CUSTOMER', phoneE164: '+966512345678', locale: 'ar' });

    await ctx.redis.flushdb(); // clear cooldown
    await ctx.prisma.otpChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 3_600_000) } });
    const second = await loginCustomer(ctx, '0512345678');
    expect(second.isNewUser).toBe(false);
  });

  it('sends the SMS in the requested language', async () => {
    await ctx.http().post(`${API}/auth/otp/request`).set('Accept-Language', 'en').send({ phone: '0555555555' }).expect(200);
    expect(ctx.sms.sent.at(-1)?.body).toMatch(/^Your HUDHUD sign-in code: \d{6}/);
  });

  it('rejects a wrong code and locks the challenge after too many attempts', async () => {
    await ctx.http().post(`${API}/auth/otp/request`).send({ phone: '0512345678' }).expect(200);
    const real = ctx.sms.lastCodeFor('+966512345678');
    const wrong = real === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i++) {
      const res = await ctx.http().post(`${API}/auth/otp/verify`).send({ phone: '0512345678', code: wrong }).expect(400);
      expect(res.body.code).toBe('otpInvalid');
    }
    const locked = await ctx.http().post(`${API}/auth/otp/verify`).send({ phone: '0512345678', code: real }).expect(400);
    expect(locked.body.code).toBe('otpTooManyAttempts');
  });

  it('does not accept a code twice', async () => {
    await ctx.http().post(`${API}/auth/otp/request`).send({ phone: '0512345678' }).expect(200);
    const code = ctx.sms.lastCodeFor('+966512345678');
    await ctx.http().post(`${API}/auth/otp/verify`).send({ phone: '0512345678', code }).expect(200);
    const again = await ctx.http().post(`${API}/auth/otp/verify`).send({ phone: '0512345678', code }).expect(400);
    expect(again.body.code).toBe('otpExpired');
  });

  it('enforces a resend cooldown with Retry-After', async () => {
    await ctx.http().post(`${API}/auth/otp/request`).send({ phone: '0512345678' }).expect(200);
    const res = await ctx.http().post(`${API}/auth/otp/request`).send({ phone: '0512345678' }).expect(429);
    expect(res.body.code).toBe('rateLimited');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('refuses blocked accounts', async () => {
    await loginCustomer(ctx, '0512345678');
    await ctx.prisma.user.update({ where: { phoneE164: '+966512345678' }, data: { status: 'BLOCKED' } });
    await ctx.prisma.otpChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 3_600_000) } });
    await ctx.http().post(`${API}/auth/otp/request`).send({ phone: '0512345678' }).expect(200);
    const res = await ctx
      .http()
      .post(`${API}/auth/otp/verify`)
      .send({ phone: '0512345678', code: ctx.sms.lastCodeFor('+966512345678') })
      .expect(403);
    expect(res.body.code).toBe('accountBlocked');
  });

  it('rejects non-Saudi numbers with a localized message', async () => {
    const res = await ctx
      .http()
      .post(`${API}/auth/otp/request`)
      .set('Accept-Language', 'ar')
      .send({ phone: '+971501234567' })
      .expect(400);
    expect(res.body).toMatchObject({ code: 'phoneInvalid', message: expect.stringContaining('05') });
  });
});

describe('refresh token rotation', () => {
  it('rotates tokens and detects reuse by revoking the whole family', async () => {
    const { refreshToken: t1 } = await loginCustomer(ctx);
    const r2 = await ctx.http().post(`${API}/auth/refresh`).send({ refreshToken: t1 }).expect(200);
    const t2: string = r2.body.refreshToken;
    expect(t2).not.toBe(t1);

    // Simulate an attacker replaying t1 after the grace period.
    await ctx.prisma.session.updateMany({
      where: { id: t1.split('.')[0] },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    await ctx.http().post(`${API}/auth/refresh`).send({ refreshToken: t1 }).expect(401);

    // The legitimate holder of t2 is signed out too, and so is the access token minted with it.
    await ctx.http().post(`${API}/auth/refresh`).send({ refreshToken: t2 }).expect(401);
    await ctx.http().get(`${API}/me`).set(bearer(r2.body.accessToken)).expect(401);
  });

  it('tolerates a concurrent double refresh without revoking the family', async () => {
    const { refreshToken: t1 } = await loginCustomer(ctx);
    const r2 = await ctx.http().post(`${API}/auth/refresh`).send({ refreshToken: t1 }).expect(200);
    await ctx.http().post(`${API}/auth/refresh`).send({ refreshToken: t1 }).expect(401);
    await ctx.http().post(`${API}/auth/refresh`).send({ refreshToken: r2.body.refreshToken }).expect(200);
  });

  it('rejects malformed and forged refresh tokens', async () => {
    const { refreshToken } = await loginCustomer(ctx);
    await ctx.http().post(`${API}/auth/refresh`).send({ refreshToken: 'garbage' }).expect(401);
    const [id] = refreshToken.split('.');
    await ctx.http().post(`${API}/auth/refresh`).send({ refreshToken: `${id}.forged` }).expect(401);
    // A forged secret for a real session revokes that session family.
    await ctx.http().post(`${API}/auth/refresh`).send({ refreshToken }).expect(401);
  });

  it('logout invalidates both access and refresh tokens immediately', async () => {
    const { accessToken, refreshToken } = await loginCustomer(ctx);
    await ctx.http().post(`${API}/auth/logout`).set(bearer(accessToken)).expect(204);
    await ctx.http().get(`${API}/me`).set(bearer(accessToken)).expect(401);
    await ctx.http().post(`${API}/auth/refresh`).send({ refreshToken }).expect(401);
  });

  it('lists sessions and revokes another device', async () => {
    const a = await loginCustomer(ctx);
    await ctx.redis.flushdb();
    await ctx.prisma.otpChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 3_600_000) } });
    const b = await loginCustomer(ctx);
    const list = await ctx.http().get(`${API}/auth/sessions`).set(bearer(a.accessToken)).expect(200);
    expect(list.body).toHaveLength(2);
    const other = list.body.find((s: { current: boolean }) => !s.current);
    await ctx.http().delete(`${API}/auth/sessions/${other.id}`).set(bearer(a.accessToken)).expect(204);
    await ctx.http().get(`${API}/me`).set(bearer(b.accessToken)).expect(401);
    await ctx.http().get(`${API}/me`).set(bearer(a.accessToken)).expect(200);
  });
});

describe('staff login with mandatory 2FA', () => {
  it('requires TOTP enrolment on first login and returns recovery codes once', async () => {
    const tokens = await loginStaff(ctx);
    expect(tokens.recoveryCodes).toHaveLength(10);
    const me = await ctx.http().get(`${API}/admin/me`).set(bearer(tokens.accessToken)).expect(200);
    expect(me.body.roles).toEqual(['owner']);
    expect(me.body.permissions).toContain('settings.payments');

    const again = await loginStaff(ctx);
    expect(again.recoveryCodes).toBeUndefined();
  });

  it('rejects wrong passwords without revealing whether the account exists', async () => {
    const a = await ctx.http().post(`${API}/auth/staff/login`).send({ email: OWNER.email, password: 'wrong-password' }).expect(401);
    const b = await ctx.http().post(`${API}/auth/staff/login`).send({ email: 'nobody@test.sa', password: 'wrong-password' }).expect(401);
    expect(a.body).toEqual(b.body);
  });

  it('locks the account after repeated failures', async () => {
    for (let i = 0; i < 5; i++) {
      await ctx.http().post(`${API}/auth/staff/login`).send({ email: OWNER.email, password: 'wrong-password' }).expect(401);
    }
    const res = await ctx.http().post(`${API}/auth/staff/login`).send(OWNER).expect(429);
    expect(res.body.code).toBe('rateLimited');
  });

  it('rejects an invalid TOTP code and a replayed one', async () => {
    await loginStaff(ctx); // enrol
    const secret = totpSecrets.get(OWNER.email)!;
    const login = await ctx.http().post(`${API}/auth/staff/login`).send(OWNER).expect(200);
    const { mfaToken } = login.body;

    await ctx.http().post(`${API}/auth/staff/totp/verify`).send({ mfaToken, code: '000000' }).expect(401);
    await ctx.prisma.totpSecret.updateMany({ data: { lastUsedStep: null } });
    const code = authenticator.generate(secret);
    await ctx.http().post(`${API}/auth/staff/totp/verify`).send({ mfaToken, code }).expect(200);
    const replay = await ctx.http().post(`${API}/auth/staff/totp/verify`).send({ mfaToken, code }).expect(401);
    expect(replay.body.code).toBe('totpInvalid');
  });

  it('accepts each recovery code exactly once', async () => {
    const { recoveryCodes } = await loginStaff(ctx);
    const login = await ctx.http().post(`${API}/auth/staff/login`).send(OWNER).expect(200);
    const body = { mfaToken: login.body.mfaToken, recoveryCode: recoveryCodes![0] };
    await ctx.http().post(`${API}/auth/staff/totp/verify`).send(body).expect(200);
    await ctx.http().post(`${API}/auth/staff/totp/verify`).send(body).expect(401);
  });

  it('does not let an MFA token be used as an access token', async () => {
    const login = await ctx.http().post(`${API}/auth/staff/login`).send(OWNER).expect(200);
    await ctx.http().get(`${API}/admin/me`).set(bearer(login.body.mfaToken)).expect(401);
  });
});

describe('authorisation', () => {
  it('keeps customers out of admin routes', async () => {
    const { accessToken } = await loginCustomer(ctx);
    const res = await ctx.http().get(`${API}/admin/me`).set(bearer(accessToken)).expect(403);
    expect(res.body.code).toBe('forbidden');
  });

  it('enforces per-permission access for staff roles and audits admin changes', async () => {
    const owner = await loginStaff(ctx);
    const created = await ctx
      .http()
      .post(`${API}/admin/staff`)
      .set(bearer(owner.accessToken))
      .send({ email: 'tech@test.sa', fullName: 'فني', temporaryPassword: 'Technician-Pass-1!', roleKeys: ['technician'] })
      .expect(201);
    expect(created.body).toMatchObject({ email: 'tech@test.sa', twoFactorEnabled: false });

    const tech = await loginStaff(ctx, 'tech@test.sa', 'Technician-Pass-1!');
    await ctx.http().get(`${API}/admin/me`).set(bearer(tech.accessToken)).expect(200);
    await ctx.http().get(`${API}/admin/staff`).set(bearer(tech.accessToken)).expect(403);
    await ctx.http().get(`${API}/admin/audit-logs`).set(bearer(tech.accessToken)).expect(403);

    const logs = await ctx.http().get(`${API}/admin/audit-logs?action=staff.`).set(bearer(owner.accessToken)).expect(200);
    expect(logs.body.items[0]).toMatchObject({ action: 'staff.create', entityType: 'user', entityId: created.body.id });
    expect(JSON.stringify(logs.body.items[0].after)).not.toContain('Technician-Pass-1!');
  });

  it('only owners can grant the owner role, and the last owner cannot be removed', async () => {
    const owner = await loginStaff(ctx);
    const admin = await ctx
      .http()
      .post(`${API}/admin/staff`)
      .set(bearer(owner.accessToken))
      .send({ email: 'admin@test.sa', fullName: 'Admin', temporaryPassword: 'Admin-Password-1!', roleKeys: ['admin'] })
      .expect(201);
    const adminTokens = await loginStaff(ctx, 'admin@test.sa', 'Admin-Password-1!');

    await ctx
      .http()
      .patch(`${API}/admin/staff/${admin.body.id}`)
      .set(bearer(adminTokens.accessToken))
      .send({ roleKeys: ['owner'] })
      .expect(403);

    const ownerId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: OWNER.email } })).id;
    const res = await ctx
      .http()
      .patch(`${API}/admin/staff/${ownerId}`)
      .set(bearer(owner.accessToken))
      .send({ roleKeys: ['admin'] })
      .expect(409);
    expect(res.body.code).toBe('lastOwner');
  });

  it('blocking a staff member signs them out everywhere', async () => {
    const owner = await loginStaff(ctx);
    const created = await ctx
      .http()
      .post(`${API}/admin/staff`)
      .set(bearer(owner.accessToken))
      .send({ email: 'ops@test.sa', fullName: 'Ops', temporaryPassword: 'Ops-Password-123!', roleKeys: ['order_processor'] })
      .expect(201);
    const ops = await loginStaff(ctx, 'ops@test.sa', 'Ops-Password-123!');
    await ctx.http().patch(`${API}/admin/staff/${created.body.id}`).set(bearer(owner.accessToken)).send({ status: 'BLOCKED' }).expect(200);
    await ctx.http().get(`${API}/admin/me`).set(bearer(ops.accessToken)).expect(401);
  });
});

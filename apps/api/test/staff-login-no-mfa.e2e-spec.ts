// Must run before AppModule is imported: ConfigModule validates the environment at import time.
import './no-mfa-env';
import { bearer, closeTestApp, createTestApp, OWNER, resetState, type TestContext } from './helpers';

const API = '/api/v1';
let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => closeTestApp(ctx));
beforeEach(() => resetState(ctx));

describe('staff login with STAFF_MFA_REQUIRED=false', () => {
  it('signs in with email and password alone', async () => {
    const login = await ctx.http().post(`${API}/auth/staff/login`).send(OWNER).expect(200);
    expect(login.body).toMatchObject({ mfaRequired: false, accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(login.body.mfaToken).toBeUndefined();

    const me = await ctx.http().get(`${API}/admin/me`).set(bearer(login.body.accessToken)).expect(200);
    expect(me.body.roles).toEqual(['owner']);
  });

  it('still rejects wrong passwords and locks after repeated failures', async () => {
    for (let i = 0; i < 5; i++) {
      await ctx.http().post(`${API}/auth/staff/login`).send({ email: OWNER.email, password: 'wrong-password' }).expect(401);
    }
    await ctx.http().post(`${API}/auth/staff/login`).send(OWNER).expect(429);
  });
});

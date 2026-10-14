import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { authenticator } from 'otplib';
import request from 'supertest';
import { seedGeo, seedLog, seedOwner, seedRbac } from '../prisma/seed-lib';

seedLog.info = () => undefined;
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { SMS_PROVIDER, type SmsMessage, type SmsProvider } from '../src/modules/sms/sms.port';

export const OWNER = { email: 'owner@test.sa', password: 'Owner-Password-123!' };

/** Captures outbound SMS so tests can read OTP codes. */
export class CapturingSms implements SmsProvider {
  readonly name = 'capture';
  readonly sent: SmsMessage[] = [];
  async send(message: SmsMessage) {
    this.sent.push(message);
    return {};
  }
  lastCodeFor(phone: string): string {
    const msg = [...this.sent].reverse().find((m) => m.to === phone);
    const code = msg?.body.match(/\d{6}/)?.[0];
    if (!code) throw new Error(`No OTP sent to ${phone}`);
    return code;
  }
}

export interface TestContext {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  prisma: PrismaClient;
  redis: Redis;
  sms: CapturingSms;
}

export async function createTestApp(): Promise<TestContext> {
  const sms = new CapturingSms();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(sms)
    .compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  configureApp(app);
  await app.init();
  return {
    app,
    http: () => request(app.getHttpServer()),
    prisma: new PrismaClient(),
    redis: new Redis(process.env.REDIS_URL!),
    sms,
  };
}

/** Wipe all data and re-seed reference data, so every test file starts from the same state. */
export async function resetState(ctx: TestContext): Promise<void> {
  const tables = await ctx.prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await ctx.prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  await ctx.redis.flushdb();
  ctx.sms.sent.length = 0;
  await seedRbac(ctx.prisma);
  await seedGeo(ctx.prisma);
  await seedOwner(ctx.prisma, OWNER.email, OWNER.password);
}

export async function closeTestApp(ctx: TestContext): Promise<void> {
  await ctx.app.close();
  await ctx.prisma.$disconnect();
  ctx.redis.disconnect();
}

/** Full customer OTP login; returns tokens. */
export async function loginCustomer(ctx: TestContext, phone = '0512345678') {
  await ctx.http().post('/api/v1/auth/otp/request').send({ phone }).expect(200);
  const e164 = `+966${phone.replace(/^0/, '')}`;
  const res = await ctx
    .http()
    .post('/api/v1/auth/otp/verify')
    .send({ phone, code: ctx.sms.lastCodeFor(e164) })
    .expect(200);
  return res.body as { accessToken: string; refreshToken: string; isNewUser: boolean };
}

/** TOTP secrets captured at enrolment, keyed by email, so later logins can generate codes. */
export const totpSecrets = new Map<string, string>();

/** Staff login including TOTP enrolment on first use. */
export async function loginStaff(ctx: TestContext, email = OWNER.email, password = OWNER.password) {
  const login = await ctx.http().post('/api/v1/auth/staff/login').send({ email, password }).expect(200);
  const { mfaToken, enrollmentRequired } = login.body as { mfaToken: string; enrollmentRequired: boolean };
  if (enrollmentRequired) {
    const enroll = await ctx.http().post('/api/v1/auth/staff/totp/enroll').send({ mfaToken }).expect(200);
    totpSecrets.set(email, enroll.body.secret);
  }
  const secret = totpSecrets.get(email);
  if (!secret) throw new Error(`No TOTP secret cached for ${email}`);
  // Clear the replay guard so consecutive logins inside one 30s step work in tests.
  await ctx.prisma.totpSecret.updateMany({ where: { user: { email } }, data: { lastUsedStep: null } });
  const verify = await ctx
    .http()
    .post('/api/v1/auth/staff/totp/verify')
    .send({ mfaToken, code: authenticator.generate(secret) })
    .expect(200);
  return verify.body as { accessToken: string; refreshToken: string; recoveryCodes?: string[] };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { redact } from '../modules/audit/audit.service';
import type { AppConfig } from './config/app-config.service';
import { validateEnv } from './config/env';
import { CryptoService } from './crypto/crypto.service';
import { AllExceptionsFilter } from './errors/all-exceptions.filter';
import { AppError } from './errors/app-error';

const baseEnv = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_MFA_SECRET: 'b'.repeat(32),
  OTP_PEPPER: 'c'.repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv(baseEnv);
    expect(env).toMatchObject({ PORT: 4100, OTP_LENGTH: 6, SMS_PROVIDER: 'console', SWAGGER_ENABLED: true });
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3100', 'http://localhost:3101']);
  });

  it('reports every invalid variable', () => {
    expect(() => validateEnv({ ...baseEnv, ENCRYPTION_KEY: 'short', JWT_ACCESS_SECRET: 'x' })).toThrow(
      /ENCRYPTION_KEY[\s\S]*JWT_ACCESS_SECRET|JWT_ACCESS_SECRET[\s\S]*ENCRYPTION_KEY/,
    );
  });

  it('refuses unsafe production settings', () => {
    expect(() => validateEnv({ ...baseEnv, NODE_ENV: 'production', SWAGGER_ENABLED: 'false' })).toThrow(/SMS_PROVIDER=console/);
    expect(() =>
      validateEnv({ ...baseEnv, NODE_ENV: 'production', SMS_PROVIDER: 'unifonic', UNIFONIC_APP_SID: 'x', UNIFONIC_SENDER_ID: 'y' }),
    ).toThrow(/SWAGGER_ENABLED/);
  });

  it('requires Unifonic credentials when selected', () => {
    expect(() => validateEnv({ ...baseEnv, SMS_PROVIDER: 'unifonic' })).toThrow(/UNIFONIC_APP_SID/);
  });
});

describe('CryptoService', () => {
  const crypto = new CryptoService({ get: () => baseEnv.ENCRYPTION_KEY } as unknown as AppConfig);

  it('round-trips AES-GCM and uses a fresh IV each time', () => {
    const a = crypto.encrypt('JBSWY3DPEHPK3PXP');
    const b = crypto.encrypt('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(crypto.decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('detects tampering and unknown formats', () => {
    const parts = crypto.encrypt('secret').split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => crypto.decrypt(parts.join('.'))).toThrow();
    expect(() => crypto.decrypt('v0.a.b.c')).toThrow(/Unsupported/);
  });

  it('generates codes of the requested shape', () => {
    expect(crypto.numericCode(6)).toMatch(/^\d{6}$/);
    expect(crypto.recoveryCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(crypto.randomToken(32)).toHaveLength(43);
  });

  it('compares in constant time and handles different lengths', () => {
    expect(crypto.safeEqual('abc', 'abc')).toBe(true);
    expect(crypto.safeEqual('abc', 'abd')).toBe(false);
    expect(crypto.safeEqual('abc', 'abcd')).toBe(false);
    expect(crypto.hmac('k', 'v')).toHaveLength(64);
    expect(crypto.sha256('v')).toHaveLength(64);
  });
});

describe('redact', () => {
  it('hides credentials at any depth but keeps ordinary fields', () => {
    expect(
      redact({
        email: 'a@b.c',
        temporaryPassword: 'p',
        nested: { refreshToken: 't', postalCode: '12345', code: '123456' },
        list: [{ secret: 's', name: 'n' }],
      }),
    ).toEqual({
      email: 'a@b.c',
      temporaryPassword: '[REDACTED]',
      nested: { refreshToken: '[REDACTED]', postalCode: '12345', code: '[REDACTED]' },
      list: [{ secret: '[REDACTED]', name: 'n' }],
    });
  });

  it('passes through primitives and nullish values', () => {
    expect(redact(null)).toBeNull();
    expect(redact(5)).toBe(5);
  });
});

describe('AllExceptionsFilter', () => {
  function run(exception: unknown, lang = 'en') {
    const res = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string> };
    const response = {
      status(code: number) {
        res.statusCode = code;
        return this;
      },
      json(body: unknown) {
        res.body = body;
      },
      setHeader(k: string, v: string) {
        res.headers[k] = v;
      },
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/x', headers: { 'accept-language': lang }, query: {} }),
        getResponse: () => response,
      }),
    };
    new AllExceptionsFilter().catch(exception, host as never);
    return res;
  }

  it('localizes AppErrors', () => {
    expect(run(AppError.badRequest('otpInvalid'), 'ar').body).toEqual({
      statusCode: 400,
      code: 'otpInvalid',
      message: 'رمز التحقق غير صحيح',
    });
  });

  it('sets Retry-After for rate limits', () => {
    const res = run(AppError.rateLimited(42));
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('42');
  });

  it('maps framework and Prisma errors to stable codes', () => {
    expect(run(new ThrottlerException()).body).toMatchObject({ statusCode: 429, code: 'rateLimited' });
    expect(run(new NotFoundException()).body).toMatchObject({ statusCode: 404, code: 'notFound' });
    expect(run(new HttpException({ message: ['x must be a string'] }, 400)).body).toMatchObject({
      code: 'validation',
      details: { fields: ['x must be a string'] },
    });
    expect(run(new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT)).body).toMatchObject({ code: 'generic' });
    const p2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6', meta: { target: ['email'] } });
    expect(run(p2002).body).toMatchObject({ statusCode: 409, code: 'conflict' });
    const p2025 = new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: '6' });
    expect(run(p2025).body).toMatchObject({ statusCode: 404 });
  });

  it('hides internals of unexpected errors', () => {
    const res = run(new Error('db password is hunter2'));
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});

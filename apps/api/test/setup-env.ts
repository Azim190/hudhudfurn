import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Load the developer .env (secrets), then point at the isolated test database and Redis db. */
const envFile = join(__dirname, '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const pgPort = process.env.POSTGRES_PORT ?? '55432';
const redisPort = process.env.REDIS_PORT ?? '56379';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'warn';
process.env.SMS_PROVIDER = 'console';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? `postgresql://hudhud:hudhud@localhost:${pgPort}/hudhud_test?schema=public`;
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? `redis://localhost:${redisPort}/1`;

// CI provides no .env: fall back to throwaway secrets.
const fallback = 'test-secret-'.padEnd(48, 'x');
process.env.JWT_ACCESS_SECRET ??= fallback;
process.env.JWT_MFA_SECRET ??= `${fallback}-mfa`;
process.env.OTP_PEPPER ??= `${fallback}-otp`;
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');

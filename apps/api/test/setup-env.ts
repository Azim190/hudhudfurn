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

// Isolated object storage bucket and search index for tests.
process.env.S3_BUCKET = process.env.TEST_S3_BUCKET ?? 'hudhud-media-test';
process.env.S3_PRIVATE_BUCKET = process.env.TEST_S3_PRIVATE_BUCKET ?? 'hudhud-private-test';
process.env.MEILI_INDEX_PREFIX = 'test_';
process.env.S3_ENDPOINT ??= 'http://localhost:8333';
process.env.S3_ACCESS_KEY ??= 'hudhud';
process.env.S3_SECRET_KEY ??= 'hudhud-dev-secret';
process.env.MEDIA_PUBLIC_BASE_URL = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}`;
process.env.MEILI_HOST ??= 'http://localhost:7700';
process.env.MEILI_API_KEY ??= 'dev_master_key_change_me_please';

// Payments run through the local simulator; tests never reach real gateways or ZATCA.
process.env.PAYMENTS_SIMULATOR = 'true';
process.env.ZATCA_MODE = 'off';
for (const key of ['MOYASAR_SECRET_KEY', 'TABBY_SECRET_KEY', 'TAMARA_API_TOKEN', 'ZATCA_PRIVATE_KEY', 'ZATCA_CSID_TOKEN', 'ZATCA_CSID_SECRET']) delete process.env[key];
process.env.API_PUBLIC_URL ??= 'http://localhost:4100';
process.env.STOREFRONT_URL ??= 'http://localhost:3100';

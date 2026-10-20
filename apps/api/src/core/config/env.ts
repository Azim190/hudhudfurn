import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: csv.default('http://localhost:3100,http://localhost:3101'),
  TRUST_PROXY: bool.default('false'),
  SWAGGER_ENABLED: bool.default('true'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_MFA_SECRET: z.string().min(32),
  CUSTOMER_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(60),
  STAFF_REFRESH_TTL_HOURS: z.coerce.number().int().positive().default(12),

  /** HMAC pepper for OTP code hashes. */
  OTP_PEPPER: z.string().min(32),
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(60),
  OTP_MAX_PER_WINDOW: z.coerce.number().int().positive().default(3),
  OTP_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  /** 32 bytes, base64. Encrypts TOTP secrets and other sensitive columns (AES-256-GCM). */
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY must be 32 bytes base64'),

  /** Staff must confirm sign-in with an authenticator code. Can only be turned off outside production. */
  STAFF_MFA_REQUIRED: bool.default('true'),
  STAFF_LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  STAFF_LOGIN_LOCK_SECONDS: z.coerce.number().int().positive().default(900),
  TOTP_ISSUER: z.string().default('HUDHUD'),

  /** Run BullMQ workers in this process (disable on API-only replicas). */
  WORKERS_ENABLED: bool.default('true'),

  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('me-central-1'),
  S3_BUCKET: z.string().default('hudhud-media'),
  /** Bucket without public access for customer uploads. */
  S3_PRIVATE_BUCKET: z.string().default('hudhud-private'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: bool.default('true'),
  /** Public base URL for media (CDN in production), e.g. https://cdn.example.sa/hudhud-media */
  MEDIA_PUBLIC_BASE_URL: z.string().url(),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(15),

  MEILI_HOST: z.string().url().default('http://localhost:7700'),
  MEILI_API_KEY: z.string().min(1),
  MEILI_INDEX_PREFIX: z.string().default(''),

  /** Storefront on-demand ISR revalidation endpoint and shared secret (optional). */
  STOREFRONT_REVALIDATE_URL: z.string().url().optional(),
  REVALIDATE_SECRET: z.string().min(32).optional(),

  /** Public URLs used for payment redirects and gateway callbacks. */
  STOREFRONT_URL: z.string().url().default('http://localhost:3100'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4100'),

  /** Local payment simulator for development and tests. Refused in production. */
  PAYMENTS_SIMULATOR: bool.default('false'),
  MOYASAR_SECRET_KEY: z.string().optional(),
  /** Shared secret configured on the Moyasar webhook (sent as secret_token). */
  MOYASAR_WEBHOOK_SECRET: z.string().optional(),
  MOYASAR_BASE_URL: z.string().url().default('https://api.moyasar.com'),
  TABBY_SECRET_KEY: z.string().optional(),
  TABBY_MERCHANT_CODE: z.string().optional(),
  /** Value of the custom header registered with the Tabby webhook (X-Webhook-Secret). */
  TABBY_WEBHOOK_SECRET: z.string().optional(),
  TABBY_BASE_URL: z.string().url().default('https://api.tabby.ai'),
  TAMARA_API_TOKEN: z.string().optional(),
  /** Notification key: Tamara signs webhook JWTs with it (HS256). */
  TAMARA_NOTIFICATION_TOKEN: z.string().optional(),
  TAMARA_BASE_URL: z.string().url().default('https://api-sandbox.tamara.co'),

  /** ZATCA e-invoicing. off: sign and store only; sandbox/simulation/production: also report. */
  ZATCA_MODE: z.enum(['off', 'sandbox', 'simulation', 'production']).default('off'),
  /** secp256k1 private key (PEM, base64-encoded). A local development key is generated when absent. */
  ZATCA_PRIVATE_KEY: z.string().optional(),
  /** CSID certificate: binarySecurityToken returned by ZATCA (base64). */
  ZATCA_CSID_TOKEN: z.string().optional(),
  ZATCA_CSID_SECRET: z.string().optional(),

  SMS_PROVIDER: z.enum(['console', 'unifonic']).default('console'),
  UNIFONIC_APP_SID: z.string().optional(),
  UNIFONIC_SENDER_ID: z.string().optional(),
  UNIFONIC_BASE_URL: z.string().url().default('https://el.cloud.unifonic.com'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (!env.STAFF_MFA_REQUIRED) throw new Error('STAFF_MFA_REQUIRED=false is not allowed in production');
    if (env.SMS_PROVIDER === 'console') throw new Error('SMS_PROVIDER=console is not allowed in production');
    if (env.SWAGGER_ENABLED) throw new Error('Disable SWAGGER_ENABLED in production');
    if (env.PAYMENTS_SIMULATOR) throw new Error('PAYMENTS_SIMULATOR is not allowed in production');
    if (!env.ZATCA_PRIVATE_KEY) throw new Error('ZATCA_PRIVATE_KEY is required in production');
  }
  if (env.SMS_PROVIDER === 'unifonic' && (!env.UNIFONIC_APP_SID || !env.UNIFONIC_SENDER_ID)) {
    throw new Error('UNIFONIC_APP_SID and UNIFONIC_SENDER_ID are required when SMS_PROVIDER=unifonic');
  }
  if (env.ZATCA_MODE !== 'off' && (!env.ZATCA_PRIVATE_KEY || !env.ZATCA_CSID_TOKEN || !env.ZATCA_CSID_SECRET)) {
    throw new Error('ZATCA_PRIVATE_KEY, ZATCA_CSID_TOKEN and ZATCA_CSID_SECRET are required when ZATCA_MODE is not off');
  }
  if (env.MOYASAR_SECRET_KEY && !env.MOYASAR_WEBHOOK_SECRET) throw new Error('MOYASAR_WEBHOOK_SECRET is required with MOYASAR_SECRET_KEY');
  if (env.TABBY_SECRET_KEY && (!env.TABBY_MERCHANT_CODE || !env.TABBY_WEBHOOK_SECRET)) {
    throw new Error('TABBY_MERCHANT_CODE and TABBY_WEBHOOK_SECRET are required with TABBY_SECRET_KEY');
  }
  if (env.TAMARA_API_TOKEN && !env.TAMARA_NOTIFICATION_TOKEN) throw new Error('TAMARA_NOTIFICATION_TOKEN is required with TAMARA_API_TOKEN');
  return env;
}

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

  STAFF_LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  STAFF_LOGIN_LOCK_SECONDS: z.coerce.number().int().positive().default(900),
  TOTP_ISSUER: z.string().default('HUDHUD'),

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
    if (env.SMS_PROVIDER === 'console') throw new Error('SMS_PROVIDER=console is not allowed in production');
    if (env.SWAGGER_ENABLED) throw new Error('Disable SWAGGER_ENABLED in production');
  }
  if (env.SMS_PROVIDER === 'unifonic' && (!env.UNIFONIC_APP_SID || !env.UNIFONIC_SENDER_ID)) {
    throw new Error('UNIFONIC_APP_SID and UNIFONIC_SENDER_ID are required when SMS_PROVIDER=unifonic');
  }
  return env;
}

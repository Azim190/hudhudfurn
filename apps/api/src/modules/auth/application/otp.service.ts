import { Inject, Injectable } from '@nestjs/common';
import { maskPhone, normalizeSaudiMobile } from '@hudhud/domain';
import { translate, type Locale } from '@hudhud/i18n';
import { AppConfig } from '../../../core/config/app-config.service';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { AppError } from '../../../core/errors/app-error';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SMS_PROVIDER, type SmsProvider } from '../../sms/sms.port';
import type { ClientContext, IssuedTokens } from '../auth.types';
import { TokenService } from './token.service';

export interface OtpRequestResult {
  phone: string;
  maskedPhone: string;
  length: number;
  expiresInSeconds: number;
  resendInSeconds: number;
}

/** Customer passwordless login by Saudi mobile number. */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: AppConfig,
    private readonly tokens: TokenService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async request(rawPhone: string, locale: Locale, client: ClientContext): Promise<OtpRequestResult> {
    const phone = this.normalize(rawPhone);
    const now = Date.now();
    const windowStart = new Date(now - this.config.get('OTP_WINDOW_SECONDS') * 1000);
    const recent = await this.prisma.otpChallenge.findMany({
      where: { phoneE164: phone, purpose: 'LOGIN', createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const cooldownMs = this.config.get('OTP_RESEND_COOLDOWN_SECONDS') * 1000;
    const last = recent[0];
    if (last && now - last.createdAt.getTime() < cooldownMs) {
      throw AppError.rateLimited(Math.ceil((cooldownMs - (now - last.createdAt.getTime())) / 1000));
    }
    if (recent.length >= this.config.get('OTP_MAX_PER_WINDOW')) {
      const oldest = recent[recent.length - 1]!;
      const retry = this.config.get('OTP_WINDOW_SECONDS') - Math.floor((now - oldest.createdAt.getTime()) / 1000);
      throw AppError.rateLimited(Math.max(1, retry));
    }

    const length = this.config.get('OTP_LENGTH');
    const ttl = this.config.get('OTP_TTL_SECONDS');
    const code = this.crypto.numericCode(length);

    await this.prisma.$transaction([
      // Only the newest code is valid.
      this.prisma.otpChallenge.updateMany({
        where: { phoneE164: phone, purpose: 'LOGIN', consumedAt: null, expiresAt: { gt: new Date(now) } },
        data: { expiresAt: new Date(now) },
      }),
      this.prisma.otpChallenge.create({
        data: {
          phoneE164: phone,
          purpose: 'LOGIN',
          codeHash: this.hash(phone, code),
          ip: client.ip,
          expiresAt: new Date(now + ttl * 1000),
        },
      }),
    ]);

    await this.sms.send({ to: phone, body: translate(locale, 'sms.otp', { code, minutes: Math.ceil(ttl / 60) }) });

    return {
      phone,
      maskedPhone: maskPhone(phone),
      length,
      expiresInSeconds: ttl,
      resendInSeconds: this.config.get('OTP_RESEND_COOLDOWN_SECONDS'),
    };
  }

  async verify(
    rawPhone: string,
    code: string,
    locale: Locale,
    client: ClientContext,
  ): Promise<IssuedTokens & { isNewUser: boolean }> {
    const phone = this.normalize(rawPhone);
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phoneE164: phone, purpose: 'LOGIN', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge || challenge.expiresAt.getTime() <= Date.now()) throw AppError.badRequest('otpExpired');

    const maxAttempts = this.config.get('OTP_MAX_ATTEMPTS');
    // Count the attempt atomically before comparing, so parallel guesses cannot exceed the limit.
    const { count } = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    if (count !== 1) throw AppError.badRequest('otpTooManyAttempts');

    if (!this.crypto.safeEqual(challenge.codeHash, this.hash(phone, String(code).trim()))) {
      throw AppError.badRequest('otpInvalid');
    }

    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw AppError.badRequest('otpExpired');

    const existing = await this.prisma.user.findUnique({ where: { phoneE164: phone } });
    if (existing && existing.status !== 'ACTIVE') throw AppError.forbidden('accountBlocked');

    const user = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } })
      : await this.prisma.user.create({
          data: { kind: 'CUSTOMER', phoneE164: phone, locale, lastLoginAt: new Date() },
        });

    // OTP never yields an MFA-verified session, so staff cannot reach admin routes this way.
    const tokens = await this.tokens.issue(user, { mfaVerified: false, client });
    return { ...tokens, isNewUser: !existing };
  }

  private normalize(raw: string): string {
    const phone = normalizeSaudiMobile(raw);
    if (!phone) throw AppError.badRequest('phoneInvalid');
    return phone;
  }

  private hash(phone: string, code: string): string {
    return this.crypto.hmac(this.config.get('OTP_PEPPER'), `${phone}:${code}`);
  }
}

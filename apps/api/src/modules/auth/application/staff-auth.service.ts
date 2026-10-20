import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type Redis from 'ioredis';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { AppConfig } from '../../../core/config/app-config.service';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { AppError } from '../../../core/errors/app-error';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { InjectRedis } from '../../../core/redis/redis.provider';
import type { ClientContext, IssuedTokens } from '../auth.types';
import { TokenService } from './token.service';

const TOTP_STEP_SECONDS = 30;
const RECOVERY_CODE_COUNT = 10;
const MFA_TOKEN_TTL_SECONDS = 300;

interface MfaClaims {
  sub: string;
  purpose: 'mfa';
}

export type StaffLoginResult =
  | { mfaRequired: true; mfaToken: string; mfaTokenExpiresIn: number; enrollmentRequired: boolean }
  /** STAFF_MFA_REQUIRED=false (non-production only): the password alone opens a session. */
  | ({ mfaRequired: false } & IssuedTokens);

export interface TotpEnrollment {
  otpauthUri: string;
  qrDataUrl: string;
  secret: string;
}

export type TotpVerifyResult = IssuedTokens & { recoveryCodes?: string[] };

/**
 * Staff sign-in: email + password → short-lived MFA token → TOTP → session. With STAFF_MFA_REQUIRED=false
 * (never in production) the password step issues a session directly, marked as not MFA-verified.
 * Repeated failures lock the account for a configurable period.
 */
@Injectable()
export class StaffAuthService {
  /** Real argon2 hash of a random value, verified when the account does not exist to equalise timing. */
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    private readonly config: AppConfig,
    private readonly tokens: TokenService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    authenticator.options = { step: TOTP_STEP_SECONDS, window: 1, digits: 6 };
    this.dummyHash = StaffAuthService.hashPassword(this.crypto.randomToken(16));
  }

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 4 });
  }

  async login(email: string, password: string, client: ClientContext): Promise<StaffLoginResult> {
    const normalized = email.trim().toLowerCase();
    await this.assertNotLocked(`login:${normalized}`);

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      include: { totp: { select: { confirmedAt: true } } },
    });
    const valid = await argon2
      .verify(user?.passwordHash ?? (await this.dummyHash), password)
      .catch(() => false);

    if (!user || user.kind !== 'STAFF' || !user.passwordHash || !valid) {
      await this.registerFailure(`login:${normalized}`);
      throw AppError.unauthorized('invalidCredentials');
    }
    if (user.status !== 'ACTIVE') throw AppError.forbidden('accountBlocked');
    await this.redis.del(this.failKey(`login:${normalized}`));

    if (!this.config.get('STAFF_MFA_REQUIRED')) {
      await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return { mfaRequired: false, ...(await this.tokens.issue(user, { mfaVerified: false, client })) };
    }

    const claims: MfaClaims = { sub: user.id, purpose: 'mfa' };
    return {
      mfaRequired: true,
      mfaToken: await this.jwt.signAsync(claims, {
        secret: this.config.get('JWT_MFA_SECRET'),
        expiresIn: MFA_TOKEN_TTL_SECONDS,
        audience: 'hudhud-mfa',
      }),
      mfaTokenExpiresIn: MFA_TOKEN_TTL_SECONDS,
      enrollmentRequired: !user.totp?.confirmedAt,
    };
  }

  async enroll(mfaToken: string): Promise<TotpEnrollment> {
    const user = await this.userFromMfaToken(mfaToken);
    if (user.totp?.confirmedAt) throw AppError.conflict('totpAlreadyEnrolled');

    const secret = authenticator.generateSecret(20);
    await this.prisma.totpSecret.upsert({
      where: { userId: user.id },
      create: { userId: user.id, secretEncrypted: this.crypto.encrypt(secret), recoveryCodesHashed: [] },
      update: { secretEncrypted: this.crypto.encrypt(secret), confirmedAt: null, lastUsedStep: null },
    });
    const otpauthUri = authenticator.keyuri(user.email ?? user.id, this.config.get('TOTP_ISSUER'), secret);
    return { otpauthUri, qrDataUrl: await QRCode.toDataURL(otpauthUri, { margin: 1, width: 240 }), secret };
  }

  async verify(
    mfaToken: string,
    input: { code?: string; recoveryCode?: string },
    client: ClientContext,
  ): Promise<TotpVerifyResult> {
    const user = await this.userFromMfaToken(mfaToken);
    const totp = user.totp;
    if (!totp) throw AppError.badRequest('totpRequired');
    const lockKey = `totp:${user.id}`;
    await this.assertNotLocked(lockKey);

    let recoveryCodes: string[] | undefined;
    if (input.code) {
      const secret = this.crypto.decrypt(totp.secretEncrypted);
      const delta = authenticator.checkDelta(input.code.trim(), secret);
      const step = delta === null ? null : BigInt(Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS) + delta);
      // Reject codes from a time step that was already used (replay protection).
      if (step === null || (totp.lastUsedStep !== null && step <= totp.lastUsedStep)) {
        await this.registerFailure(lockKey);
        throw AppError.unauthorized('totpInvalid');
      }
      const updated = await this.prisma.totpSecret.updateMany({
        where: {
          userId: user.id,
          OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
        },
        data: { lastUsedStep: step },
      });
      if (updated.count !== 1) throw AppError.unauthorized('totpInvalid');

      if (!totp.confirmedAt) {
        recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => this.crypto.recoveryCode());
        await this.prisma.totpSecret.update({
          where: { userId: user.id },
          data: {
            confirmedAt: new Date(),
            recoveryCodesHashed: await Promise.all(recoveryCodes.map((c) => argon2.hash(c))),
          },
        });
      }
    } else if (input.recoveryCode && totp.confirmedAt) {
      const candidate = input.recoveryCode.trim().toUpperCase();
      let matchIndex = -1;
      for (const [i, hash] of totp.recoveryCodesHashed.entries()) {
        if (await argon2.verify(hash, candidate).catch(() => false)) {
          matchIndex = i;
          break;
        }
      }
      if (matchIndex < 0) {
        await this.registerFailure(lockKey);
        throw AppError.unauthorized('totpInvalid');
      }
      await this.prisma.totpSecret.update({
        where: { userId: user.id },
        data: { recoveryCodesHashed: totp.recoveryCodesHashed.filter((_, i) => i !== matchIndex) },
      });
    } else {
      throw AppError.badRequest('totpRequired');
    }

    await this.redis.del(this.failKey(lockKey));
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await this.tokens.issue(user, { mfaVerified: true, client });
    return recoveryCodes ? { ...tokens, recoveryCodes } : tokens;
  }

  /** Admin action: force a staff member to enrol 2FA again and sign out everywhere. */
  async resetTotp(userId: string): Promise<void> {
    await this.prisma.totpSecret.deleteMany({ where: { userId } });
    await this.tokens.revokeAllForUser(userId);
  }

  private async userFromMfaToken(token: string) {
    let claims: MfaClaims;
    try {
      claims = await this.jwt.verifyAsync<MfaClaims>(token, {
        secret: this.config.get('JWT_MFA_SECRET'),
        audience: 'hudhud-mfa',
      });
    } catch {
      throw AppError.unauthorized('sessionExpired');
    }
    if (claims.purpose !== 'mfa') throw AppError.unauthorized('sessionExpired');
    const user = await this.prisma.user.findUnique({ where: { id: claims.sub }, include: { totp: true } });
    if (!user || user.kind !== 'STAFF') throw AppError.unauthorized('sessionExpired');
    if (user.status !== 'ACTIVE') throw AppError.forbidden('accountBlocked');
    return user;
  }

  private failKey(scope: string) {
    return `auth:fail:${scope}`;
  }

  private async assertNotLocked(scope: string): Promise<void> {
    const key = this.failKey(scope);
    const failures = Number((await this.redis.get(key)) ?? 0);
    if (failures >= this.config.get('STAFF_LOGIN_MAX_FAILURES')) {
      throw AppError.rateLimited(Math.max(1, await this.redis.ttl(key)));
    }
  }

  private async registerFailure(scope: string): Promise<void> {
    const key = this.failKey(scope);
    const failures = await this.redis.incr(key);
    if (failures === 1) await this.redis.expire(key, this.config.get('STAFF_LOGIN_LOCK_SECONDS'));
  }
}

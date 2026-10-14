import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Session, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../../../core/config/app-config.service';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { AppError } from '../../../core/errors/app-error';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { AccessTokenClaims, ClientContext, IssuedTokens } from '../auth.types';

/** A rotated token presented again within this window is treated as a client race, not theft. */
const ROTATION_GRACE_MS = 15_000;

/**
 * Issues access tokens (short-lived JWT) and opaque refresh tokens of the form
 * `<sessionId>.<secret>`; only sha256(secret) is stored.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    private readonly config: AppConfig,
  ) {}

  async issue(
    user: Pick<User, 'id' | 'kind'>,
    opts: { mfaVerified: boolean; familyId?: string; client: ClientContext },
  ): Promise<IssuedTokens> {
    const secret = this.crypto.randomToken(32);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        familyId: opts.familyId ?? randomUUID(),
        refreshTokenHash: this.crypto.sha256(secret),
        mfaVerified: opts.mfaVerified,
        ip: opts.client.ip,
        userAgent: opts.client.userAgent,
        expiresAt: this.refreshExpiry(user.kind),
      },
    });
    return this.tokensFor(user, session, secret);
  }

  async rotate(refreshToken: string, client: ClientContext): Promise<IssuedTokens> {
    const [sessionId, secret] = this.parse(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: { select: { id: true, kind: true, status: true } } },
    });
    if (!session) throw AppError.unauthorized('sessionExpired');

    if (!this.crypto.safeEqual(session.refreshTokenHash, this.crypto.sha256(secret))) {
      await this.revokeFamily(session.familyId, 'refresh secret mismatch');
      throw AppError.unauthorized('sessionExpired');
    }
    if (session.revokedAt) {
      const benignRace =
        session.replacedById && Date.now() - session.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (!benignRace) await this.revokeFamily(session.familyId, 'refresh token reuse');
      throw AppError.unauthorized('sessionExpired');
    }
    if (session.expiresAt.getTime() <= Date.now()) throw AppError.unauthorized('sessionExpired');
    if (session.user.status !== 'ACTIVE') {
      await this.revokeFamily(session.familyId, 'user not active');
      throw AppError.forbidden('accountBlocked');
    }

    const newSecret = this.crypto.randomToken(32);
    const next = await this.prisma.$transaction(async (tx) => {
      // Conditional update makes concurrent rotations of the same token lose cleanly.
      const created = await tx.session.create({
        data: {
          userId: session.userId,
          familyId: session.familyId,
          refreshTokenHash: this.crypto.sha256(newSecret),
          mfaVerified: session.mfaVerified,
          ip: client.ip,
          userAgent: client.userAgent,
          deviceLabel: session.deviceLabel,
          // Absolute lifetime is bounded by the family's first session for staff (sliding for customers).
          expiresAt:
            session.user.kind === 'STAFF' ? session.expiresAt : this.refreshExpiry(session.user.kind),
        },
      });
      const { count } = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: created.id },
      });
      if (count !== 1) throw AppError.unauthorized('sessionExpired');
      return created;
    });
    return this.tokensFor(session.user, next, newSecret);
  }

  /** True while the session family still has a live (unrevoked, unexpired) refresh token. */
  async isFamilyActive(userId: string, familyId: string): Promise<boolean> {
    const live = await this.prisma.session.count({
      where: { userId, familyId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return live > 0;
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw AppError.notFound();
    await this.revokeFamily(session.familyId, 'user revoked session');
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listActive(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, familyId: true, ip: true, userAgent: true, deviceLabel: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    const { count } = await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count > 0) this.logger.warn(`Revoked session family ${familyId}: ${reason}`);
  }

  private parse(refreshToken: string): [string, string] {
    const [id, secret, extra] = (refreshToken ?? '').split('.');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !secret || extra !== undefined || !uuid.test(id)) throw AppError.unauthorized('sessionExpired');
    return [id, secret];
  }

  private refreshExpiry(kind: User['kind']): Date {
    const ms =
      kind === 'STAFF'
        ? this.config.get('STAFF_REFRESH_TTL_HOURS') * 3_600_000
        : this.config.get('CUSTOMER_REFRESH_TTL_DAYS') * 86_400_000;
    return new Date(Date.now() + ms);
  }

  private async tokensFor(
    user: Pick<User, 'id' | 'kind'>,
    session: Pick<Session, 'id' | 'familyId' | 'mfaVerified' | 'expiresAt'>,
    secret: string,
  ): Promise<IssuedTokens> {
    const claims: AccessTokenClaims = {
      sub: user.id,
      kind: user.kind,
      sid: session.id,
      fid: session.familyId,
      mfa: session.mfaVerified,
    };
    const ttl = this.config.get('JWT_ACCESS_TTL_SECONDS');
    return {
      accessToken: await this.jwt.signAsync(claims, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: ttl,
        audience: 'hudhud-api',
        issuer: 'hudhud',
      }),
      accessTokenExpiresIn: ttl,
      refreshToken: `${session.id}.${secret}`,
      refreshTokenExpiresAt: session.expiresAt.toISOString(),
    };
  }
}

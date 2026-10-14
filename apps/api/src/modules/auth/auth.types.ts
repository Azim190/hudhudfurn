import type { UserKind } from '@prisma/client';

/** Claims carried in the access token. Permissions are resolved per request, not embedded. */
export interface AccessTokenClaims {
  sub: string;
  kind: UserKind;
  sid: string;
  /** Session family; revoking the family invalidates every token derived from it. */
  fid: string;
  /** True only for staff sessions that completed TOTP. */
  mfa: boolean;
}

export interface AuthUser {
  id: string;
  kind: UserKind;
  sessionId: string;
  familyId: string;
  mfa: boolean;
}

export interface ClientContext {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

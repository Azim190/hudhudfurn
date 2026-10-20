import { withBase } from './base-path';

/** Short-lived MFA token between password and TOTP steps; httpOnly so page scripts never see it. */
export const MFA_COOKIE = 'hda_mfa';

export function mfaCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: withBase('/bff/auth/staff'),
    maxAge: maxAgeSeconds,
  };
}

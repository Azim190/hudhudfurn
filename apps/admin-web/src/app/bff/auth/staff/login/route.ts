import {
  ADMIN_COOKIES,
  apiFetch,
  clientIpOf,
  errorResponse,
  forbiddenOrigin,
  isSameOrigin,
  localeOf,
  writeSession,
  type IssuedTokens,
} from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';
import { MFA_COOKIE, mfaCookieOptions } from '@/lib/mfa-cookie';

type StaffLoginResult =
  | { mfaRequired: true; mfaToken: string; mfaTokenExpiresIn: number; enrollmentRequired: boolean }
  | ({ mfaRequired: false } & IssuedTokens);

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  try {
    const result = await apiFetch<StaffLoginResult>('/auth/staff/login', {
      method: 'POST',
      body: { email: String(email ?? ''), password: String(password ?? '') },
      locale: localeOf(req),
      clientIp: clientIpOf(req),
      userAgent: req.headers.get('user-agent'),
    });
    // Authenticator step disabled on this API (non-production only): signed in already.
    if (!result.mfaRequired) {
      const res = NextResponse.json({ signedIn: true, enrollmentRequired: false }, { headers: { 'Cache-Control': 'no-store' } });
      writeSession(res.cookies, ADMIN_COOKIES, result);
      return res;
    }
    const res = NextResponse.json({ signedIn: false, enrollmentRequired: result.enrollmentRequired });
    res.cookies.set(MFA_COOKIE, result.mfaToken, mfaCookieOptions(result.mfaTokenExpiresIn));
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}

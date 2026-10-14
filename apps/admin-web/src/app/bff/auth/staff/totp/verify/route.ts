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

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const mfaToken = req.cookies.get(MFA_COOKIE)?.value;
  if (!mfaToken) return NextResponse.json({ statusCode: 401, code: 'sessionExpired' }, { status: 401 });
  const { code, recoveryCode } = (await req.json().catch(() => ({}))) as { code?: string; recoveryCode?: string };
  try {
    const result = await apiFetch<IssuedTokens & { recoveryCodes?: string[] }>('/auth/staff/totp/verify', {
      method: 'POST',
      body: { mfaToken, ...(code ? { code } : {}), ...(recoveryCode ? { recoveryCode } : {}) },
      locale: localeOf(req),
      clientIp: clientIpOf(req),
      userAgent: req.headers.get('user-agent'),
    });
    // Recovery codes are shown exactly once, right after enrolment.
    const res = NextResponse.json({ recoveryCodes: result.recoveryCodes ?? null }, { headers: { 'Cache-Control': 'no-store' } });
    writeSession(res.cookies, ADMIN_COOKIES, result);
    res.cookies.set(MFA_COOKIE, '', mfaCookieOptions(0));
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}

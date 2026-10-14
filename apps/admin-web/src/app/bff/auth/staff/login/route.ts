import { apiFetch, clientIpOf, errorResponse, forbiddenOrigin, isSameOrigin, localeOf } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';
import { MFA_COOKIE, mfaCookieOptions } from '@/lib/mfa-cookie';

interface StaffLoginResult {
  mfaToken: string;
  mfaTokenExpiresIn: number;
  enrollmentRequired: boolean;
}

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
    const res = NextResponse.json({ enrollmentRequired: result.enrollmentRequired });
    res.cookies.set(MFA_COOKIE, result.mfaToken, mfaCookieOptions(result.mfaTokenExpiresIn));
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}

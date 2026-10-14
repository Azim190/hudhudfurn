import { apiFetch, errorResponse, forbiddenOrigin, isSameOrigin, localeOf } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';
import { MFA_COOKIE } from '@/lib/mfa-cookie';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const mfaToken = req.cookies.get(MFA_COOKIE)?.value;
  if (!mfaToken) return NextResponse.json({ statusCode: 401, code: 'sessionExpired' }, { status: 401 });
  try {
    const enrollment = await apiFetch<{ otpauthUri: string; qrDataUrl: string; secret: string }>('/auth/staff/totp/enroll', {
      method: 'POST',
      body: { mfaToken },
      locale: localeOf(req),
    });
    return NextResponse.json(enrollment, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

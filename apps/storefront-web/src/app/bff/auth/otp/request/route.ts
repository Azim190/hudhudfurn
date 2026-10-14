import { apiFetch, clientIpOf, errorResponse, forbiddenOrigin, isSameOrigin, localeOf } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const { phone } = (await req.json().catch(() => ({}))) as { phone?: unknown };
  try {
    const result = await apiFetch('/auth/otp/request', {
      method: 'POST',
      body: { phone: typeof phone === 'string' ? phone : '' },
      locale: localeOf(req),
      clientIp: clientIpOf(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

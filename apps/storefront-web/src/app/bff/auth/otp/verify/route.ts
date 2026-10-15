import {
  apiFetch,
  clientIpOf,
  errorResponse,
  forbiddenOrigin,
  isSameOrigin,
  localeOf,
  STOREFRONT_COOKIES,
  writeSession,
  type IssuedTokens,
} from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';
import { mergeGuestCart } from '@/lib/cart-bff';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const { phone, code } = (await req.json().catch(() => ({}))) as { phone?: unknown; code?: unknown };
  try {
    const result = await apiFetch<IssuedTokens & { isNewUser: boolean }>('/auth/otp/verify', {
      method: 'POST',
      body: { phone: String(phone ?? ''), code: String(code ?? '') },
      locale: localeOf(req),
      clientIp: clientIpOf(req),
      userAgent: req.headers.get('user-agent'),
    });
    // Tokens go into httpOnly cookies only; the browser never sees them.
    const res = NextResponse.json({ isNewUser: result.isNewUser });
    writeSession(res.cookies, STOREFRONT_COOKIES, result);
    await mergeGuestCart(req, res, result.accessToken);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}

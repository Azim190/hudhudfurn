import 'server-only';
import {
  ApiError,
  apiFetchWithStatus,
  clientIpOf,
  errorResponse,
  forbiddenOrigin,
  isSameOrigin,
  localeOf,
  refreshTokens,
  STOREFRONT_COOKIES,
  writeSession,
  type ApiRequest,
  type IssuedTokens,
} from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

/** Guest cart token (opaque, httpOnly). Customers' carts are resolved from their session instead. */
export const CART_COOKIE = 'hd_cart';
const CART_TTL_SECONDS = 60 * 60 * 24 * 30;

export const cartCookieOptions = (maxAge = CART_TTL_SECONDS) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});

/**
 * Cart calls work for guests and customers: attach the session when there is one (refreshing it
 * if needed), always attach the guest token, and persist a newly issued guest token.
 */
export async function proxyCart(req: NextRequest, path: string, init: Omit<ApiRequest, 'token' | 'headers'> = {}): Promise<NextResponse> {
  if (init.method && init.method !== 'GET' && !isSameOrigin(req)) return forbiddenOrigin();
  let access = req.cookies.get(STOREFRONT_COOKIES.access)?.value ?? null;
  let rotated: IssuedTokens | null = null;
  const refresh = req.cookies.get(STOREFRONT_COOKIES.refresh)?.value;
  if (!access && refresh) {
    const outcome = await refreshTokens(refresh, { ip: clientIpOf(req), userAgent: req.headers.get('user-agent') });
    if (outcome.kind === 'refreshed') {
      rotated = outcome.tokens;
      access = outcome.tokens.accessToken;
    }
  }
  const guestToken = req.cookies.get(CART_COOKIE)?.value;
  let res: NextResponse;
  try {
    const { status, data } = await apiFetchWithStatus<Record<string, unknown>>(path, {
      ...init,
      token: access,
      locale: localeOf(req),
      clientIp: clientIpOf(req),
      headers: guestToken ? { 'X-Cart-Token': guestToken } : {},
    });
    const { cartToken, ...body } = (data ?? {}) as { cartToken?: string };
    res = NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    if (typeof cartToken === 'string') res.cookies.set(CART_COOKIE, cartToken, cartCookieOptions());
  } catch (err) {
    res = errorResponse(err);
    // An expired session must not block guest shopping: retry anonymously once.
    if (err instanceof ApiError && err.status === 401 && access) {
      return proxyCart(withoutSession(req), path, init);
    }
  }
  if (rotated) writeSession(res.cookies, STOREFRONT_COOKIES, rotated);
  return res;
}

function withoutSession(req: NextRequest): NextRequest {
  const clone = req.clone() as NextRequest;
  clone.cookies.delete(STOREFRONT_COOKIES.access);
  clone.cookies.delete(STOREFRONT_COOKIES.refresh);
  return clone;
}

/** Called right after OTP sign-in: fold the guest cart into the customer's cart. */
export async function mergeGuestCart(req: NextRequest, res: NextResponse, accessToken: string): Promise<void> {
  const guestToken = req.cookies.get(CART_COOKIE)?.value;
  if (!guestToken) return;
  try {
    await apiFetchWithStatus('/cart/merge', { method: 'POST', token: accessToken, body: { guestToken } });
  } catch {
    // Merging is best effort; the guest cart simply stays separate.
  }
  res.cookies.set(CART_COOKIE, '', cartCookieOptions(0));
}

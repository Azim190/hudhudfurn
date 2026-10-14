import { apiFetch, clearSession, forbiddenOrigin, isSameOrigin, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const token = req.cookies.get(STOREFRONT_COOKIES.access)?.value;
  // Revoke server-side when we can; clear cookies regardless.
  if (token) await apiFetch('/auth/logout', { method: 'POST', token }).catch(() => undefined);
  const res = new NextResponse(null, { status: 204 });
  clearSession(res.cookies, STOREFRONT_COOKIES);
  return res;
}

import { ADMIN_COOKIES, apiFetch, clearSession, forbiddenOrigin, isSameOrigin } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  const token = req.cookies.get(ADMIN_COOKIES.access)?.value;
  if (token) await apiFetch('/auth/logout', { method: 'POST', token }).catch(() => undefined);
  const res = new NextResponse(null, { status: 204 });
  clearSession(res.cookies, ADMIN_COOKIES);
  return res;
}

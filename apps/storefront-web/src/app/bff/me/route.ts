import { proxyAuthed, STOREFRONT_COOKIES } from '@hudhud/web-core';
import type { NextRequest } from 'next/server';

export function GET(req: NextRequest) {
  return proxyAuthed(req, STOREFRONT_COOKIES, '/me');
}

export async function PATCH(req: NextRequest) {
  const body: unknown = await req.json().catch(() => ({}));
  return proxyAuthed(req, STOREFRONT_COOKIES, '/me', { method: 'PATCH', body });
}

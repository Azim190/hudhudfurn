import { proxyAuthed, STOREFRONT_COOKIES } from '@hudhud/web-core';
import type { NextRequest } from 'next/server';

export function GET(req: NextRequest) {
  return proxyAuthed(req, STOREFRONT_COOKIES, '/me/wishlist');
}

export async function PUT(req: NextRequest) {
  return proxyAuthed(req, STOREFRONT_COOKIES, '/me/wishlist', { method: 'PUT', body: await req.json().catch(() => ({})) });
}

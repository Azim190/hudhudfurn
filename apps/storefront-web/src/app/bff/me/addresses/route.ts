import { proxyAuthed, STOREFRONT_COOKIES } from '@hudhud/web-core';
import type { NextRequest } from 'next/server';

export function GET(req: NextRequest) {
  return proxyAuthed(req, STOREFRONT_COOKIES, '/me/addresses');
}

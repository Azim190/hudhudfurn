import { proxyAuthed, STOREFRONT_COOKIES } from '@hudhud/web-core';
import type { NextRequest } from 'next/server';

export function GET(req: NextRequest) {
  return proxyAuthed(req, STOREFRONT_COOKIES, '/me/measurement-profiles');
}

export async function POST(req: NextRequest) {
  return proxyAuthed(req, STOREFRONT_COOKIES, '/me/measurement-profiles', { method: 'POST', body: await req.json().catch(() => ({})) });
}

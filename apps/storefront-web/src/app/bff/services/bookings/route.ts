import { proxyAuthed, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

export function GET(req: NextRequest) {
  return proxyAuthed(req, STOREFRONT_COOKIES, '/services/bookings');
}

export async function POST(req: NextRequest) {
  const key = req.headers.get('idempotency-key') ?? '';
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) return NextResponse.json({ code: 'validation', message: 'Idempotency-Key required' }, { status: 400 });
  return proxyAuthed(req, STOREFRONT_COOKIES, '/services/bookings', { method: 'POST', body: await req.json().catch(() => ({})), headers: { 'Idempotency-Key': key } });
}

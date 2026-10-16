import { proxyAuthed, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  if (!/^QT-\d{4}-\d{6}$/.test(number)) return NextResponse.json({ code: 'notFound' }, { status: 404 });
  return proxyAuthed(req, STOREFRONT_COOKIES, `/quotations/${number}/accept`, { method: 'POST', body: await req.json().catch(() => ({})) });
}

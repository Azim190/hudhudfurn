import { proxyAuthed, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(req: NextRequest, ctx: { params: Promise<{ variantId: string }> }) {
  const { variantId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(variantId)) return NextResponse.json({ code: 'notFound' }, { status: 404 });
  return proxyAuthed(req, STOREFRONT_COOKIES, `/variants/${variantId}/notify-me`, { method: 'POST', body: {} });
}

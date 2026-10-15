import { proxyAuthed, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ productId: string }> }) {
  const { productId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(productId)) return NextResponse.json({ code: 'notFound' }, { status: 404 });
  return proxyAuthed(req, STOREFRONT_COOKIES, `/me/wishlist/${productId}`, { method: 'DELETE' });
}

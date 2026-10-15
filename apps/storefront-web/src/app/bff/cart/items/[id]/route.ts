import { NextResponse, type NextRequest } from 'next/server';
import { proxyCart } from '@/lib/cart-bff';

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/;

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ code: 'notFound' }, { status: 404 });
  return proxyCart(req, `/cart/items/${id}`, { method: 'PATCH', body: await req.json().catch(() => ({})) });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ code: 'notFound' }, { status: 404 });
  return proxyCart(req, `/cart/items/${id}`, { method: 'DELETE' });
}

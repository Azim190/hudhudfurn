import { proxyAuthed, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';
import { isUuid } from '@/lib/order-access';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ code: 'notFound' }, { status: 404 });
  return proxyAuthed(req, STOREFRONT_COOKIES, `/me/measurement-profiles/${id}`, { method: 'PATCH', body: await req.json().catch(() => ({})) });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ code: 'notFound' }, { status: 404 });
  return proxyAuthed(req, STOREFRONT_COOKIES, `/me/measurement-profiles/${id}`, { method: 'DELETE' });
}

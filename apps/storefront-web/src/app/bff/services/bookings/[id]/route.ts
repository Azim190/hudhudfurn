import { proxyAuthed, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';
import { isUuid } from '@/lib/order-access';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ code: 'notFound' }, { status: 404 });
  return proxyAuthed(req, STOREFRONT_COOKIES, `/services/bookings/${id}`);
}

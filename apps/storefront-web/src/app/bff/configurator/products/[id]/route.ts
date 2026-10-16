import { apiFetch, errorResponse, localeOf } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';
import { isUuid } from '@/lib/order-access';

/** Configurator template for a product (not cached: admins tune prices and rules live). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ code: 'notFound' }, { status: 404 });
  try {
    return NextResponse.json(await apiFetch(`/configurator/products/${id}`, { locale: localeOf(req) }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

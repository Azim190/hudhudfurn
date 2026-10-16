import { proxyAuthed, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';
import { isUuid } from '@/lib/order-access';

const ACTIONS = new Set(['cancel', 'reschedule']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (!isUuid(id) || !ACTIONS.has(action)) return NextResponse.json({ code: 'notFound' }, { status: 404 });
  return proxyAuthed(req, STOREFRONT_COOKIES, `/services/bookings/${id}/${action}`, { method: 'POST', body: await req.json().catch(() => ({})) });
}

import { NextResponse, type NextRequest } from 'next/server';
import { proxyShopper } from '@/lib/cart-bff';
import { isUuid, ORDERS_COOKIE, orderTokenFor } from '@/lib/order-access';

const ACTIONS = new Set(['verify', 'pay', 'cancel']);

/** verify (after the payment page), pay (retry) and cancel, for the order's owner or guest token holder. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (!isUuid(id) || !ACTIONS.has(action)) return NextResponse.json({ code: 'notFound' }, { status: 404 });
  const token = orderTokenFor(req.cookies.get(ORDERS_COOKIE)?.value, id);
  return proxyShopper(req, `/orders/${id}/${action}`, { method: 'POST', body: await req.json().catch(() => ({})) }, { headers: token ? { 'X-Order-Token': token } : {} });
}

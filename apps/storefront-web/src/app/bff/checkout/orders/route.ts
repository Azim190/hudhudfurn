import { NextResponse, type NextRequest } from 'next/server';
import { CART_COOKIE, cartCookieOptions, proxyShopper } from '@/lib/cart-bff';
import { ORDERS_COOKIE, ordersCookieOptions, withOrderToken } from '@/lib/order-access';

/** Place the order. The order access token stays in an httpOnly cookie; the guest cart is cleared. */
export async function POST(req: NextRequest) {
  const key = req.headers.get('idempotency-key') ?? '';
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) return NextResponse.json({ code: 'validation', message: 'Idempotency-Key required' }, { status: 400 });
  return proxyShopper(
    req,
    '/checkout/orders',
    { method: 'POST', body: await req.json().catch(() => ({})) },
    {
      headers: { 'Idempotency-Key': key },
      onSuccess: (body, res) => {
        const { accessToken, ...rest } = body as { accessToken?: string; order?: { id: string } };
        if (accessToken && rest.order?.id) res.cookies.set(ORDERS_COOKIE, withOrderToken(req.cookies.get(ORDERS_COOKIE)?.value, rest.order.id, accessToken), ordersCookieOptions);
        res.cookies.set(CART_COOKIE, '', cartCookieOptions(0));
        return rest;
      },
    },
  );
}

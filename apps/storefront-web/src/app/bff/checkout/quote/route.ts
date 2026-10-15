import type { NextRequest } from 'next/server';
import { proxyCart } from '@/lib/cart-bff';

export async function POST(req: NextRequest) {
  return proxyCart(req, '/checkout/quote', { method: 'POST', body: await req.json().catch(() => ({})) });
}

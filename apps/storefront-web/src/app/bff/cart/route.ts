import type { NextRequest } from 'next/server';
import { proxyCart } from '@/lib/cart-bff';

export function GET(req: NextRequest) {
  return proxyCart(req, '/cart');
}

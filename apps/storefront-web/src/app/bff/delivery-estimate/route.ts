import { apiFetch, errorResponse } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get('city') ?? '';
  const productId = req.nextUrl.searchParams.get('productId');
  if (!/^[\w-]{2,36}$/.test(city) || (productId && !/^[0-9a-f-]{36}$/.test(productId))) return NextResponse.json({ code: 'validation' }, { status: 400 });
  try {
    const qs = new URLSearchParams({ city, ...(productId ? { productId } : {}) });
    return NextResponse.json(await apiFetch(`/delivery-estimate?${qs}`, { revalidate: 3600, tags: ['catalog'] }));
  } catch (err) {
    return errorResponse(err);
  }
}

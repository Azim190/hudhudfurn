import { apiFetch, errorResponse, localeOf, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

/** Visit slots for a city/district (live: capacity changes with every booking). */
export async function GET(req: NextRequest) {
  const qs = new URLSearchParams();
  for (const k of ['cityCode', 'districtId', 'type', 'orderId']) {
    const v = req.nextUrl.searchParams.get(k);
    if (v) qs.set(k, v);
  }
  try {
    const token = req.cookies.get(STOREFRONT_COOKIES.access)?.value ?? null;
    return NextResponse.json(await apiFetch(`/services/availability?${qs}`, { token, locale: localeOf(req) }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

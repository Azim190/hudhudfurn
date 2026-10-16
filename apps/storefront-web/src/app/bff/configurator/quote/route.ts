import { apiFetch, clientIpOf, errorResponse, localeOf } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

/** Live configurator price (stateless). */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json().catch(() => ({}));
    return NextResponse.json(await apiFetch('/configurator/quote', { method: 'POST', body, locale: localeOf(req), clientIp: clientIpOf(req) }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

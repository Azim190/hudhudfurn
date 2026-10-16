import { apiBaseUrl, clientIpOf, errorResponse, forbiddenOrigin, isSameOrigin, localeOf, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

const MAX_BYTES = 12 * 1024 * 1024;

/** Customer photo upload (multipart), forwarded as-is. Works for guests; a session links it to the account. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) return NextResponse.json({ statusCode: 413, code: 'validation', message: 'Payload too large' }, { status: 413 });
  const body = await req.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return NextResponse.json({ statusCode: 413, code: 'validation', message: 'Payload too large' }, { status: 413 });
  const headers: Record<string, string> = { 'Content-Type': req.headers.get('content-type') ?? 'application/octet-stream', 'Accept-Language': localeOf(req) };
  const access = req.cookies.get(STOREFRONT_COOKIES.access)?.value;
  if (access) headers.Authorization = `Bearer ${access}`;
  const ip = clientIpOf(req);
  if (ip) headers['X-Forwarded-For'] = ip;
  try {
    const upstream = await fetch(`${apiBaseUrl()}/configurator/uploads`, { method: 'POST', headers, body, cache: 'no-store', signal: AbortSignal.timeout(60_000) });
    return new NextResponse(upstream.body, { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' } });
  } catch (err) {
    return errorResponse(err);
  }
}

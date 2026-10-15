import { ADMIN_COOKIES, proxyRawAuthed } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

type Ctx = { params: Promise<{ path: string[] }> };

/** Only these non-JSON endpoints are reachable through this proxy. */
const ALLOWED: Record<string, { method: 'GET' | 'POST'; api: string; maxBytes: number }> = {
  media: { method: 'POST', api: '/admin/media', maxBytes: 16 * 1024 * 1024 },
  'products/import': { method: 'POST', api: '/admin/products/import', maxBytes: 21 * 1024 * 1024 },
  'products/export': { method: 'GET', api: '/admin/products/export', maxBytes: 0 },
};

/** Downloads addressed by id. */
const PATTERNS: Array<{ re: RegExp; method: 'GET'; api: (id: string) => string }> = [{ re: /^invoices\/([0-9a-f-]{36})\/xml$/, method: 'GET', api: (id) => `/admin/invoices/${id}/xml` }];

async function handle(req: NextRequest, ctx: Ctx) {
  const key = (await ctx.params).path.join('/');
  for (const p of PATTERNS) {
    const m = p.re.exec(key);
    if (m && req.method === p.method) return proxyRawAuthed(req, ADMIN_COOKIES, p.api(m[1]!), { maxBytes: 0 });
  }
  const route = ALLOWED[key];
  if (!route || route.method !== req.method) return NextResponse.json({ statusCode: 404, code: 'notFound' }, { status: 404 });
  return proxyRawAuthed(req, ADMIN_COOKIES, `${route.api}${req.nextUrl.search}`, { maxBytes: route.maxBytes });
}

export const GET = handle;
export const POST = handle;

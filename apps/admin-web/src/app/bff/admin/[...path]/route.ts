import { ADMIN_COOKIES, proxyAuthed } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * Pass-through to `/api/v1/admin/*` only. The API enforces permissions; this route just attaches
 * the staff session and keeps cookies fresh. Path segments are validated to block traversal.
 */
async function forward(req: NextRequest, ctx: Ctx, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE') {
  const { path } = await ctx.params;
  if (path.some((segment) => !/^[\w-]+$/.test(segment))) {
    return NextResponse.json({ statusCode: 400, code: 'validation' }, { status: 400 });
  }
  const search = req.nextUrl.search;
  const body = method === 'GET' || method === 'DELETE' ? undefined : await req.json().catch(() => ({}));
  return proxyAuthed(req, ADMIN_COOKIES, `/admin/${path.join('/')}${search}`, { method, body });
}

export const GET = (req: NextRequest, ctx: Ctx) => forward(req, ctx, 'GET');
export const POST = (req: NextRequest, ctx: Ctx) => forward(req, ctx, 'POST');
export const PATCH = (req: NextRequest, ctx: Ctx) => forward(req, ctx, 'PATCH');
export const PUT = (req: NextRequest, ctx: Ctx) => forward(req, ctx, 'PUT');
export const DELETE = (req: NextRequest, ctx: Ctx) => forward(req, ctx, 'DELETE');

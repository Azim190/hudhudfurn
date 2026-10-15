import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, apiBaseUrl, apiFetchWithStatus, type ApiRequest } from './api-client';
import {
  clearSession,
  clientIpOf,
  isSameOrigin,
  refreshTokens,
  writeSession,
  type IssuedTokens,
  type SessionCookieNames,
} from './session';

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) return NextResponse.json(err.body, { status: err.status });
  console.error('[bff] unexpected error', err);
  return NextResponse.json({ statusCode: 502, code: 'network', message: 'Upstream unavailable' }, { status: 502 });
}

export function forbiddenOrigin(): NextResponse {
  return NextResponse.json({ statusCode: 403, code: 'forbidden', message: 'Bad origin' }, { status: 403 });
}

export function localeOf(req: NextRequest): string {
  return req.headers.get('x-hd-locale') ?? req.cookies.get('NEXT_LOCALE')?.value ?? 'ar';
}

/**
 * Call the API on behalf of the signed-in user from a BFF route handler. Refreshes the
 * access token when needed (once) and keeps the browser cookies in sync.
 */
export async function proxyAuthed(
  req: NextRequest,
  names: SessionCookieNames,
  path: string,
  init: Omit<ApiRequest, 'token'> = {},
): Promise<NextResponse> {
  if (init.method && init.method !== 'GET' && !isSameOrigin(req)) return forbiddenOrigin();

  const client = { clientIp: clientIpOf(req), userAgent: req.headers.get('user-agent'), locale: localeOf(req) };
  let access = req.cookies.get(names.access)?.value ?? null;
  const refresh = req.cookies.get(names.refresh)?.value ?? null;
  let rotated: IssuedTokens | null = null;

  const doRefresh = async () => {
    if (!refresh) return false;
    const outcome = await refreshTokens(refresh, { ip: client.clientIp, userAgent: client.userAgent });
    if (outcome.kind !== 'refreshed') return false;
    rotated = outcome.tokens;
    access = outcome.tokens.accessToken;
    return true;
  };

  if (!access) await doRefresh();
  const call = () => apiFetchWithStatus<unknown>(path, { ...init, ...client, token: access });

  let res: NextResponse;
  try {
    let upstream: { status: number; data: unknown };
    try {
      upstream = await call();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && !rotated && (await doRefresh())) upstream = await call();
      else throw err;
    }
    res =
      upstream.status === 204
        ? new NextResponse(null, { status: 204 })
        : NextResponse.json(upstream.data, { status: upstream.status });
  } catch (err) {
    res = errorResponse(err);
    if (err instanceof ApiError && err.status === 401) clearSession(res.cookies, names);
  }
  if (rotated) writeSession(res.cookies, names, rotated);
  return res;
}

/**
 * Pass-through for non-JSON traffic (multipart uploads, file downloads). The body is forwarded
 * as-is with its content type; the upstream status, content type and disposition are preserved.
 */
export async function proxyRawAuthed(
  req: NextRequest,
  names: SessionCookieNames,
  path: string,
  opts: { maxBytes?: number } = {},
): Promise<NextResponse> {
  if (req.method !== 'GET' && !isSameOrigin(req)) return forbiddenOrigin();
  const maxBytes = opts.maxBytes ?? 25 * 1024 * 1024;
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return NextResponse.json({ statusCode: 413, code: 'validation', message: 'Payload too large' }, { status: 413 });

  let access = req.cookies.get(names.access)?.value ?? null;
  let rotated: IssuedTokens | null = null;
  const refresh = req.cookies.get(names.refresh)?.value;
  if (!access && refresh) {
    const outcome = await refreshTokens(refresh, { ip: clientIpOf(req), userAgent: req.headers.get('user-agent') });
    if (outcome.kind === 'refreshed') {
      rotated = outcome.tokens;
      access = outcome.tokens.accessToken;
    }
  }
  if (!access) return NextResponse.json({ statusCode: 401, code: 'unauthorized' }, { status: 401 });

  const body = req.method === 'GET' ? undefined : await req.arrayBuffer();
  if (body && body.byteLength > maxBytes) return NextResponse.json({ statusCode: 413, code: 'validation', message: 'Payload too large' }, { status: 413 });
  const headers: Record<string, string> = { Authorization: `Bearer ${access}`, 'Accept-Language': localeOf(req) };
  const contentType = req.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;
  const ip = clientIpOf(req);
  if (ip) headers['X-Forwarded-For'] = ip;

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}${path}`, { method: req.method, headers, body, cache: 'no-store', signal: AbortSignal.timeout(120_000) });
  } catch (err) {
    return errorResponse(err);
  }
  const res = new NextResponse(upstream.body, { status: upstream.status });
  for (const h of ['content-type', 'content-disposition']) {
    const v = upstream.headers.get(h);
    if (v) res.headers.set(h, v);
  }
  if (upstream.status === 401) clearSession(res.cookies, names);
  if (rotated) writeSession(res.cookies, names, rotated);
  return res;
}

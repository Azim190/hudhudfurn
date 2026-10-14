import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, apiFetch, type ApiRequest } from './api-client';
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
  const call = () => apiFetch<unknown>(path, { ...init, ...client, token: access });

  let res: NextResponse;
  try {
    let data: unknown;
    try {
      data = await call();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && !rotated && (await doRefresh())) data = await call();
      else throw err;
    }
    res = data === undefined ? new NextResponse(null, { status: 204 }) : NextResponse.json(data);
  } catch (err) {
    res = errorResponse(err);
    if (err instanceof ApiError && err.status === 401) clearSession(res.cookies, names);
  }
  if (rotated) writeSession(res.cookies, names, rotated);
  return res;
}

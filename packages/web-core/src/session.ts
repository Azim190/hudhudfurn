import type { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiFetch } from './api-client';
import type { SessionCookieNames } from './cookie-names';

export * from './cookie-names';


export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

/** Minimal cookie-store shape shared by `cookies()` and `NextResponse.cookies`. */
export interface CookieWriter {
  set(name: string, value: string, options: Record<string, unknown>): unknown;
  delete(name: string): unknown;
}

/** Expire the access cookie a little early so we refresh before the API would reject it. */
const ACCESS_SAFETY_SECONDS = 30;

function baseOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

export function writeSession(store: CookieWriter, names: SessionCookieNames, tokens: IssuedTokens): void {
  store.set(names.access, tokens.accessToken, {
    ...baseOptions(),
    maxAge: Math.max(1, tokens.accessTokenExpiresIn - ACCESS_SAFETY_SECONDS),
  });
  store.set(names.refresh, tokens.refreshToken, {
    ...baseOptions(),
    expires: new Date(tokens.refreshTokenExpiresAt),
  });
  store.set(names.hint, '1', { ...baseOptions(), httpOnly: false, expires: new Date(tokens.refreshTokenExpiresAt) });
}

export function clearSession(store: CookieWriter, names: SessionCookieNames): void {
  store.delete(names.access);
  store.delete(names.refresh);
  store.delete(names.hint);
}

export type RefreshOutcome =
  | { kind: 'refreshed'; tokens: IssuedTokens }
  | { kind: 'race' }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

export async function refreshTokens(
  refreshToken: string,
  client: { ip?: string | null; userAgent?: string | null } = {},
): Promise<RefreshOutcome> {
  try {
    const tokens = await apiFetch<IssuedTokens>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      clientIp: client.ip,
      userAgent: client.userAgent,
    });
    return { kind: 'refreshed', tokens };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 409) return { kind: 'race' };
      if (err.status === 401 || err.status === 403) return { kind: 'invalid' };
    }
    return { kind: 'unavailable' };
  }
}

/**
 * The end-user IP as seen by our load balancer. Prefer x-real-ip (set by the LB), else the last
 * X-Forwarded-For hop (appended by the LB). The first hop is client-controlled and spoofable.
 */
export function clientIpOf(req: Pick<NextRequest, 'headers'>): string | null {
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const hops = req.headers.get('x-forwarded-for')?.split(',').map((h) => h.trim()).filter(Boolean);
  return hops?.at(-1) ?? null;
}

/**
 * Page-navigation refresh (ADR-0002): when the access cookie has expired but a refresh cookie
 * exists, rotate the tokens and redirect to the same URL so the browser retries with fresh
 * cookies. Returns `null` when nothing needs to happen.
 */
export async function refreshOnNavigation(
  req: NextRequest,
  names: SessionCookieNames,
  redirect: (url: URL) => NextResponse,
): Promise<NextResponse | null> {
  if (req.method !== 'GET') return null;
  if (req.cookies.get(names.access)?.value) return null;
  const refresh = req.cookies.get(names.refresh)?.value;
  if (!refresh) return null;
  // Prefetches must not rotate tokens: a parallel navigation will.
  if (req.headers.get('next-router-prefetch') || req.headers.get('purpose') === 'prefetch') return null;

  const outcome = await refreshTokens(refresh, { ip: clientIpOf(req), userAgent: req.headers.get('user-agent') });
  if (outcome.kind === 'race' || outcome.kind === 'unavailable') return null;

  const res = redirect(req.nextUrl.clone());
  if (outcome.kind === 'refreshed') writeSession(res.cookies, names, outcome.tokens);
  else clearSession(res.cookies, names);
  return res;
}

/**
 * CSRF defence in depth for BFF mutations: the Origin header must match the app's own origin.
 * SameSite=Lax cookies already block cross-site POSTs in modern browsers.
 */
export function isSameOrigin(req: Pick<NextRequest, 'headers' | 'nextUrl'>): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

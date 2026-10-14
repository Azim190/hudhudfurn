import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './api-client';
import { clearSession, clientIpOf, isSameOrigin, refreshTokens, STOREFRONT_COOKIES, writeSession } from './session';

const headers = (h: Record<string, string>) => ({ headers: new Headers(h) });

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('isSameOrigin', () => {
  const req = (h: Record<string, string>) => ({ ...headers(h), nextUrl: new URL('http://shop.test/x') }) as never;

  it('accepts matching origin and host', () => {
    expect(isSameOrigin(req({ origin: 'https://shop.test', host: 'shop.test' }))).toBe(true);
    expect(isSameOrigin(req({ origin: 'https://shop.test', host: 'internal:3100', 'x-forwarded-host': 'shop.test' }))).toBe(true);
  });

  it('rejects missing, foreign and malformed origins', () => {
    expect(isSameOrigin(req({ host: 'shop.test' }))).toBe(false);
    expect(isSameOrigin(req({ origin: 'https://evil.test', host: 'shop.test' }))).toBe(false);
    expect(isSameOrigin(req({ origin: 'not a url', host: 'shop.test' }))).toBe(false);
  });
});

describe('clientIpOf', () => {
  it('prefers x-real-ip, then the last forwarded hop', () => {
    expect(clientIpOf(headers({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '6.6.6.6, 2.2.2.2' }))).toBe('1.1.1.1');
    expect(clientIpOf(headers({ 'x-forwarded-for': '6.6.6.6, 2.2.2.2' }))).toBe('2.2.2.2');
    expect(clientIpOf(headers({}))).toBeNull();
  });
});

describe('session cookies', () => {
  it('writes httpOnly cookies with an early access expiry and clears both', () => {
    const set = vi.fn();
    const del = vi.fn();
    writeSession({ set, delete: del }, STOREFRONT_COOKIES, {
      accessToken: 'a',
      accessTokenExpiresIn: 900,
      refreshToken: 'r',
      refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
    });
    expect(set).toHaveBeenCalledWith('hd_at', 'a', expect.objectContaining({ httpOnly: true, sameSite: 'lax', maxAge: 870 }));
    expect(set).toHaveBeenCalledWith('hd_rt', 'r', expect.objectContaining({ httpOnly: true, expires: new Date('2030-01-01T00:00:00.000Z') }));
    expect(set).toHaveBeenCalledWith('hd_auth', '1', expect.objectContaining({ httpOnly: false }));
    clearSession({ set, delete: del }, STOREFRONT_COOKIES);
    expect(del.mock.calls).toEqual([['hd_at'], ['hd_rt'], ['hd_auth']]);
  });
});

describe('refreshTokens', () => {
  it.each([
    [200, { accessToken: 'a', accessTokenExpiresIn: 900, refreshToken: 'r', refreshTokenExpiresAt: 'x' }, 'refreshed'],
    [409, { code: 'sessionRotated' }, 'race'],
    [401, { code: 'sessionExpired' }, 'invalid'],
    [403, { code: 'accountBlocked' }, 'invalid'],
    [500, { code: 'generic' }, 'unavailable'],
  ])('maps HTTP %d to %s', async (status, body, kind) => {
    mockFetch(status, body);
    expect((await refreshTokens('id.secret')).kind).toBe(kind);
  });

  it('treats network failures as unavailable (never as logout)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    expect((await refreshTokens('id.secret')).kind).toBe('unavailable');
  });
});

describe('apiFetch', () => {
  it('sends auth, locale and forwarded IP, and parses JSON', async () => {
    const fn = mockFetch(200, { ok: true });
    await expect(apiFetch('/me', { token: 't', locale: 'en', clientIp: '1.2.3.4' })).resolves.toEqual({ ok: true });
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer t', 'Accept-Language': 'en', 'X-Forwarded-For': '1.2.3.4' });
    expect(init.cache).toBe('no-store');
  });

  it('throws ApiError with the API error body', async () => {
    mockFetch(400, { statusCode: 400, code: 'phoneInvalid', message: 'bad' });
    const err = await apiFetch('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('phoneInvalid');
  });

  it('handles 204 and non-JSON error bodies', async () => {
    mockFetch(204);
    await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeUndefined();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>oops</html>', { status: 502, statusText: 'Bad Gateway' })));
    const err = (await apiFetch('/x').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('generic');
    expect(err.status).toBe(502);
  });
});

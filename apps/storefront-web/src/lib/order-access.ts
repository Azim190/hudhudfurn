/**
 * Guest order access: the API returns an order token at checkout; the BFF keeps it in an httpOnly
 * cookie (never exposed to scripts) so the guest can open the confirmation page, retry payment
 * and view the invoice. Up to the last 10 orders are remembered on the device.
 */
export const ORDERS_COOKIE = 'hd_orders';
const MAX_ORDERS = 10;
const TTL_SECONDS = 60 * 60 * 24 * 180;

type Entry = { id: string; t: string };

export function parseOrderTokens(raw: string | undefined): Entry[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    return Array.isArray(list) ? list.filter((e): e is Entry => typeof e?.id === 'string' && typeof e?.t === 'string').slice(0, MAX_ORDERS) : [];
  } catch {
    return [];
  }
}

export function orderTokenFor(raw: string | undefined, orderId: string): string | undefined {
  return parseOrderTokens(raw).find((e) => e.id === orderId)?.t;
}

export function withOrderToken(raw: string | undefined, orderId: string, token: string): string {
  const list = [{ id: orderId, t: token }, ...parseOrderTokens(raw).filter((e) => e.id !== orderId)].slice(0, MAX_ORDERS);
  return Buffer.from(JSON.stringify(list)).toString('base64url');
}

export const ordersCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: TTL_SECONDS,
};

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

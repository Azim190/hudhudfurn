import type { PaymentMethod, PaymentProvider } from '@prisma/client';

/** Everything a gateway may need to open a hosted payment session for an order. */
export interface PaymentSessionInput {
  paymentId: string;
  method: PaymentMethod;
  amount: number;
  order: {
    id: string;
    number: string;
    locale: 'ar' | 'en';
    net: number;
    vat: number;
    shippingTotal: number;
    discount: number;
    contactName: string;
    contactPhoneE164: string;
    contactEmail: string | null;
    placedAt: Date;
    expiresAt: Date | null;
    address: { line1: string; city: string; postalCode?: string } | null;
    items: Array<{ sku: string; name: string; quantity: number; unitPrice: number; total: number; vat: number; discount: number }>;
    customerSince?: Date;
  };
  /** Storefront page the customer returns to (success, failure and cancel alike). */
  returnUrl: string;
  /** Server-to-server notification URL for gateways that take one per session. */
  notificationUrl: string;
}

export interface PaymentSession {
  providerRef: string;
  redirectUrl: string;
  raw?: unknown;
}

export type GatewayPaymentStatus = 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

export interface PaymentVerification {
  status: GatewayPaymentStatus;
  /** Amount the gateway reports, in halalas. */
  amount?: number;
  sourceSummary?: string;
  failureReason?: string;
  raw?: unknown;
}

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body: unknown;
}

export interface WebhookNotice {
  eventId: string;
  type: string;
  providerRef: string;
}

/**
 * Port for hosted-payment gateways. Gateways never decide an order's fate on their own: the
 * application always re-verifies a payment with `verify` before acting on a redirect or webhook.
 */
export interface PaymentGateway {
  readonly provider: PaymentProvider;
  readonly methods: readonly PaymentMethod[];
  createSession(input: PaymentSessionInput): Promise<PaymentSession>;
  verify(providerRef: string): Promise<PaymentVerification>;
  /** BNPL providers authorise first; the merchant captures to complete the sale. */
  capture(providerRef: string, amount: number): Promise<PaymentVerification>;
  refund(providerRef: string, amount: number, reason: string): Promise<{ providerRef?: string }>;
  /** Void an unpaid session so it can no longer be paid (best effort). */
  cancel(providerRef: string): Promise<void>;
  /** Authenticate a webhook; throws on a forged request. Returns null for events we ignore. */
  parseWebhook(req: WebhookRequest): WebhookNotice | null;
}

export const PAYMENT_GATEWAYS = Symbol('PAYMENT_GATEWAYS');

export const sar = (halalas: number) => (halalas / 100).toFixed(2);
export const halalas = (amount: string | number) => Math.round(Number(amount) * 100);

export class GatewayError extends Error {
  constructor(
    readonly provider: PaymentProvider,
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(`${provider}: ${message}`);
    this.name = 'GatewayError';
  }
}

/** JSON over HTTPS with a timeout; non-2xx responses become GatewayError. */
export async function gatewayFetch<T>(provider: PaymentProvider, url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: { Accept: 'application/json', ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
    });
  } catch (err) {
    throw new GatewayError(provider, `request failed: ${(err as Error).message}`);
  }
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!res.ok) throw new GatewayError(provider, `HTTP ${res.status}`, res.status, body);
  return body as T;
}

export const header = (req: WebhookRequest, name: string): string | undefined => {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

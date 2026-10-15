import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentMethod } from '@prisma/client';
import {
  GatewayError,
  gatewayFetch,
  halalas,
  header,
  sar,
  type GatewayPaymentStatus,
  type PaymentGateway,
  type PaymentSession,
  type PaymentSessionInput,
  type PaymentVerification,
  type WebhookNotice,
  type WebhookRequest,
} from '../payment-gateway.port';

type TamaraStatus = 'new' | 'approved' | 'authorised' | 'partially_captured' | 'fully_captured' | 'declined' | 'canceled' | 'expired' | 'refunded' | 'partially_refunded' | 'updated';

interface TamaraOrder {
  order_id: string;
  status: TamaraStatus;
  total_amount: { amount: number | string; currency: string };
}

const STATUS: Partial<Record<TamaraStatus, GatewayPaymentStatus>> = {
  new: 'PENDING',
  approved: 'PENDING',
  authorised: 'AUTHORIZED',
  partially_captured: 'AUTHORIZED',
  fully_captured: 'CAPTURED',
  refunded: 'CAPTURED',
  partially_refunded: 'CAPTURED',
  declined: 'FAILED',
  canceled: 'CANCELLED',
  expired: 'EXPIRED',
};

const money = (halalasAmount: number) => ({ amount: Number(sar(halalasAmount)), currency: 'SAR' });

/** Verify an HS256 JWT (Tamara signs notifications with the merchant's notification key). */
export function verifyHs256(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [h, p, s] = parts as [string, string, string];
  const headerJson = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as { alg?: string };
  if (headerJson.alg !== 'HS256') throw new Error('unexpected algorithm');
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const actual = Buffer.from(s, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('bad signature');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, unknown>;
  if (typeof payload.exp === 'number' && payload.exp < nowSeconds) throw new Error('token expired');
  return payload;
}

/** Tamara instalments: checkout → hosted page → approved → authorise → capture. */
export class TamaraGateway implements PaymentGateway {
  readonly provider = 'TAMARA' as const;
  readonly methods: readonly PaymentMethod[] = ['TAMARA'];

  constructor(private readonly opts: { apiToken: string; notificationToken: string; baseUrl: string }) {}

  private call<T>(path: string, method = 'GET', body?: unknown) {
    return gatewayFetch<T>(this.provider, `${this.opts.baseUrl}${path}`, { method, body, headers: { Authorization: `Bearer ${this.opts.apiToken}` } });
  }

  async createSession(input: PaymentSessionInput): Promise<PaymentSession> {
    const o = input.order;
    const [first, ...rest] = o.contactName.trim().split(/\s+/);
    const name = { first_name: first ?? o.contactName, last_name: rest.join(' ') || (first ?? o.contactName) };
    const res = await this.call<{ order_id: string; checkout_id: string; checkout_url: string }>('/checkout', 'POST', {
      order_reference_id: o.id,
      order_number: o.number,
      total_amount: money(input.amount),
      description: `Order ${o.number}`,
      country_code: 'SA',
      payment_type: 'PAY_BY_INSTALMENTS',
      locale: o.locale === 'ar' ? 'ar_SA' : 'en_US',
      items: o.items.map((i) => ({
        reference_id: i.sku,
        type: 'Physical',
        name: i.name,
        sku: i.sku,
        quantity: i.quantity,
        unit_price: money(i.unitPrice),
        discount_amount: money(i.discount),
        tax_amount: money(i.vat),
        total_amount: money(i.total),
      })),
      consumer: { ...name, phone_number: o.contactPhoneE164, email: o.contactEmail },
      shipping_address: o.address ? { ...name, line1: o.address.line1, city: o.address.city, country_code: 'SA', phone_number: o.contactPhoneE164 } : undefined,
      tax_amount: money(o.vat),
      shipping_amount: money(o.shippingTotal),
      discount: o.discount ? { name: 'Discount', amount: money(o.discount) } : undefined,
      merchant_url: { success: input.returnUrl, failure: input.returnUrl, cancel: input.returnUrl, notification: input.notificationUrl },
    });
    return { providerRef: res.order_id, redirectUrl: res.checkout_url, raw: { checkoutId: res.checkout_id } };
  }

  async verify(ref: string): Promise<PaymentVerification> {
    let order = await this.call<TamaraOrder>(`/orders/${encodeURIComponent(ref)}`);
    if (order.status === 'approved') {
      // Approved by the customer: the merchant must authorise before it can be captured.
      await this.call(`/orders/${encodeURIComponent(ref)}/authorise`, 'POST', {});
      order = await this.call<TamaraOrder>(`/orders/${encodeURIComponent(ref)}`);
    }
    return { status: STATUS[order.status] ?? 'PENDING', amount: halalas(order.total_amount.amount), sourceSummary: 'Tamara', raw: { id: order.order_id, status: order.status } };
  }

  async capture(ref: string, amount: number): Promise<PaymentVerification> {
    await this.call('/payments/capture', 'POST', {
      order_id: ref,
      total_amount: money(amount),
      shipping_info: { shipped_at: new Date().toISOString(), shipping_company: 'HUDHUD' },
    });
    return this.verify(ref);
  }

  async refund(ref: string, amount: number, reason: string): Promise<{ providerRef?: string }> {
    const res = await this.call<{ refund_id?: string }>(`/payments/simplified-refund/${encodeURIComponent(ref)}`, 'POST', { total_amount: money(amount), comment: reason });
    return { providerRef: res.refund_id };
  }

  async cancel(ref: string): Promise<void> {
    const order = await this.call<TamaraOrder>(`/orders/${encodeURIComponent(ref)}`);
    if (order.status === 'authorised') await this.call(`/orders/${encodeURIComponent(ref)}/cancel`, 'POST', { total_amount: order.total_amount });
  }

  parseWebhook(req: WebhookRequest): WebhookNotice | null {
    const bearer = header(req, 'authorization')?.replace(/^Bearer\s+/i, '');
    const token = bearer || (typeof req.query.tamaraToken === 'string' ? req.query.tamaraToken : undefined);
    if (!token) throw new GatewayError(this.provider, 'missing notification token', 401);
    try {
      verifyHs256(token, this.opts.notificationToken);
    } catch (err) {
      throw new GatewayError(this.provider, `invalid notification token: ${(err as Error).message}`, 401);
    }
    const body = req.body as { order_id?: string; order_status?: string; event_type?: string } | undefined;
    if (!body?.order_id) return null;
    const type = body.event_type ?? body.order_status ?? 'notification';
    return { eventId: `${body.order_id}:${type}`, type, providerRef: body.order_id };
  }
}

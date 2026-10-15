import { timingSafeEqual } from 'node:crypto';
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

interface TabbyPayment {
  id: string;
  status: 'CREATED' | 'AUTHORIZED' | 'CLOSED' | 'REJECTED' | 'EXPIRED';
  amount: string;
  captures?: Array<{ id: string; amount: string }>;
}

interface TabbySession {
  id: string;
  status: 'created' | 'rejected' | 'expired' | 'approved';
  payment: TabbyPayment;
  configuration?: { available_products?: { installments?: Array<{ web_url?: string }> }; products?: { installments?: { rejection_reason?: string | null } } };
}

const STATUS: Record<TabbyPayment['status'], GatewayPaymentStatus> = {
  CREATED: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CLOSED: 'CAPTURED',
  REJECTED: 'FAILED',
  EXPIRED: 'EXPIRED',
};

const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Tabby "pay in 4": checkout session → hosted page → AUTHORIZED → capture closes the payment. */
export class TabbyGateway implements PaymentGateway {
  readonly provider = 'TABBY' as const;
  readonly methods: readonly PaymentMethod[] = ['TABBY'];

  constructor(private readonly opts: { secretKey: string; merchantCode: string; webhookSecret: string; baseUrl: string }) {}

  private call<T>(path: string, method = 'GET', body?: unknown) {
    return gatewayFetch<T>(this.provider, `${this.opts.baseUrl}${path}`, { method, body, headers: { Authorization: `Bearer ${this.opts.secretKey}` } });
  }

  async createSession(input: PaymentSessionInput): Promise<PaymentSession> {
    const o = input.order;
    const session = await this.call<TabbySession>('/api/v2/checkout', 'POST', {
      payment: {
        amount: sar(input.amount),
        currency: 'SAR',
        description: `Order ${o.number}`,
        buyer: { phone: o.contactPhoneE164, email: o.contactEmail, name: o.contactName },
        shipping_address: o.address ? { city: o.address.city, address: o.address.line1, zip: o.address.postalCode ?? '' } : undefined,
        order: {
          reference_id: o.number,
          tax_amount: sar(o.vat),
          shipping_amount: sar(o.shippingTotal),
          discount_amount: sar(o.discount),
          items: o.items.map((i) => ({ title: i.name, quantity: i.quantity, unit_price: sar(i.unitPrice), discount_amount: sar(i.discount), reference_id: i.sku, category: 'home' })),
        },
        buyer_history: { registered_since: (o.customerSince ?? o.placedAt).toISOString(), loyalty_level: 0 },
        order_history: [],
      },
      lang: o.locale,
      merchant_code: this.opts.merchantCode,
      merchant_urls: { success: input.returnUrl, cancel: input.returnUrl, failure: input.returnUrl },
    });
    const url = session.configuration?.available_products?.installments?.[0]?.web_url;
    if (session.status !== 'created' || !url) {
      throw new GatewayError(this.provider, `rejected: ${session.configuration?.products?.installments?.rejection_reason ?? session.status}`, 422, { rejected: true });
    }
    return { providerRef: session.payment.id, redirectUrl: url, raw: { sessionId: session.id } };
  }

  async verify(ref: string): Promise<PaymentVerification> {
    const p = await this.call<TabbyPayment>(`/api/v2/payments/${encodeURIComponent(ref)}`);
    return { status: STATUS[p.status] ?? 'PENDING', amount: halalas(p.amount), sourceSummary: 'Tabby', raw: { id: p.id, status: p.status } };
  }

  async capture(ref: string, amount: number): Promise<PaymentVerification> {
    const p = await this.call<TabbyPayment>(`/api/v2/payments/${encodeURIComponent(ref)}/captures`, 'POST', { amount: sar(amount), reference_id: `cap-${ref}` });
    return { status: STATUS[p.status] ?? 'PENDING', amount: halalas(p.amount), sourceSummary: 'Tabby', raw: { id: p.id, status: p.status } };
  }

  async refund(ref: string, amount: number, reason: string): Promise<{ providerRef?: string }> {
    const p = await this.call<TabbyPayment & { refunds?: Array<{ id: string }> }>(`/api/v2/payments/${encodeURIComponent(ref)}/refunds`, 'POST', { amount: sar(amount), reason });
    return { providerRef: p.refunds?.at(-1)?.id };
  }

  async cancel(ref: string): Promise<void> {
    const p = await this.call<TabbyPayment>(`/api/v2/payments/${encodeURIComponent(ref)}`);
    if (p.status === 'AUTHORIZED') await this.call(`/api/v2/payments/${encodeURIComponent(ref)}/close`, 'POST', {});
  }

  parseWebhook(req: WebhookRequest): WebhookNotice | null {
    const secret = header(req, 'x-webhook-secret');
    if (!secret || !eq(secret, this.opts.webhookSecret)) throw new GatewayError(this.provider, 'invalid webhook secret', 401);
    const body = req.body as { id?: string; status?: string } | undefined;
    if (!body?.id || !body.status) return null;
    return { eventId: `${body.id}:${body.status.toLowerCase()}`, type: body.status.toLowerCase(), providerRef: body.id };
  }
}

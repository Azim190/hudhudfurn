import { timingSafeEqual } from 'node:crypto';
import type { PaymentMethod } from '@prisma/client';
import { GatewayError, gatewayFetch, type GatewayPaymentStatus, type PaymentGateway, type PaymentSession, type PaymentSessionInput, type PaymentVerification, type WebhookNotice, type WebhookRequest } from '../payment-gateway.port';

interface MoyasarPayment {
  id: string;
  status: 'initiated' | 'paid' | 'failed' | 'authorized' | 'captured' | 'refunded' | 'voided';
  amount: number;
  source?: { type?: string; company?: string; number?: string; message?: string };
}

interface MoyasarInvoice {
  id: string;
  status: 'initiated' | 'paid' | 'failed' | 'refunded' | 'canceled' | 'on_hold' | 'expired' | 'voided';
  amount: number;
  url: string;
  payments?: MoyasarPayment[];
}

const STATUS: Record<MoyasarInvoice['status'], GatewayPaymentStatus> = {
  initiated: 'PENDING',
  on_hold: 'PENDING',
  paid: 'CAPTURED',
  refunded: 'CAPTURED',
  failed: 'FAILED',
  canceled: 'CANCELLED',
  voided: 'CANCELLED',
  expired: 'EXPIRED',
};

const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Moyasar hosted invoices: mada, Visa, Mastercard and Apple Pay on Moyasar's PCI-compliant page.
 * Amounts are in halalas. Webhooks authenticate with the shared `secret_token` in the body.
 */
export class MoyasarGateway implements PaymentGateway {
  readonly provider = 'MOYASAR' as const;
  readonly methods: readonly PaymentMethod[] = ['CARD'];

  constructor(private readonly opts: { secretKey: string; webhookSecret: string; baseUrl: string }) {}

  private call<T>(path: string, method = 'GET', body?: unknown) {
    return gatewayFetch<T>(this.provider, `${this.opts.baseUrl}${path}`, {
      method,
      body,
      headers: { Authorization: `Basic ${Buffer.from(`${this.opts.secretKey}:`).toString('base64')}` },
    });
  }

  async createSession(input: PaymentSessionInput): Promise<PaymentSession> {
    const invoice = await this.call<MoyasarInvoice>('/v1/invoices', 'POST', {
      amount: input.amount,
      currency: 'SAR',
      description: `${input.order.locale === 'ar' ? 'طلب' : 'Order'} ${input.order.number}`,
      success_url: input.returnUrl,
      back_url: input.returnUrl,
      callback_url: input.notificationUrl,
      expired_at: input.order.expiresAt?.toISOString(),
      metadata: { order_id: input.order.id, order_number: input.order.number, payment_id: input.paymentId },
    });
    return { providerRef: invoice.id, redirectUrl: invoice.url, raw: { id: invoice.id, status: invoice.status } };
  }

  async verify(ref: string): Promise<PaymentVerification> {
    const invoice = await this.call<MoyasarInvoice>(`/v1/invoices/${encodeURIComponent(ref)}`);
    const paid = invoice.payments?.find((p) => p.status === 'paid' || p.status === 'captured');
    const lastFailed = [...(invoice.payments ?? [])].reverse().find((p) => p.status === 'failed');
    return {
      status: STATUS[invoice.status] ?? 'PENDING',
      amount: invoice.amount,
      sourceSummary: paid?.source ? [paid.source.company, paid.source.number?.slice(-4)].filter(Boolean).join(' ') : undefined,
      failureReason: !paid ? lastFailed?.source?.message : undefined,
      raw: { id: invoice.id, status: invoice.status, paymentId: paid?.id },
    };
  }

  async capture(ref: string): Promise<PaymentVerification> {
    // Invoices are captured automatically when paid.
    return this.verify(ref);
  }

  async refund(ref: string, amount: number): Promise<{ providerRef?: string }> {
    const invoice = await this.call<MoyasarInvoice>(`/v1/invoices/${encodeURIComponent(ref)}`);
    const paid = invoice.payments?.find((p) => p.status === 'paid' || p.status === 'captured');
    if (!paid) throw new GatewayError(this.provider, 'no captured payment to refund');
    const res = await this.call<MoyasarPayment>(`/v1/payments/${encodeURIComponent(paid.id)}/refund`, 'POST', { amount });
    return { providerRef: res.id };
  }

  async cancel(ref: string): Promise<void> {
    await this.call(`/v1/invoices/${encodeURIComponent(ref)}/cancel`, 'PUT');
  }

  parseWebhook(req: WebhookRequest): WebhookNotice | null {
    const body = req.body as { id?: string; type?: string; secret_token?: string; data?: { invoice_id?: string } } | undefined;
    if (!body?.secret_token || !eq(body.secret_token, this.opts.webhookSecret)) throw new GatewayError(this.provider, 'invalid webhook secret', 401);
    if (!body.id || !body.type || !body.data?.invoice_id) return null;
    return { eventId: body.id, type: body.type, providerRef: body.data.invoice_id };
  }
}

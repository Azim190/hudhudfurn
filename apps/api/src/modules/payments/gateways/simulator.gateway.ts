import { randomBytes } from 'node:crypto';
import type { PaymentMethod } from '@prisma/client';
import type Redis from 'ioredis';
import { GatewayError, type GatewayPaymentStatus, type PaymentGateway, type PaymentSession, type PaymentSessionInput, type PaymentVerification, type WebhookNotice } from '../payment-gateway.port';

export interface SimulatedPayment {
  ref: string;
  method: PaymentMethod;
  status: GatewayPaymentStatus;
  amount: number;
  refunded: number;
  orderNumber: string;
  locale: 'ar' | 'en';
  returnUrl: string;
}

const KEY = (ref: string) => `paysim:${ref}`;
const TTL_SECONDS = 7 * 86_400;

/**
 * Local stand-in for the hosted payment pages (development and automated tests only; the API
 * refuses to start with it in production). It keeps the same lifecycle as the real gateways:
 * a hosted page, a redirect back, server-side verification, BNPL authorise-then-capture and
 * refunds, so the checkout code paths are identical.
 */
export class SimulatorGateway implements PaymentGateway {
  readonly provider = 'SIMULATOR' as const;

  constructor(
    private readonly redis: Redis,
    private readonly apiPublicUrl: string,
    readonly methods: readonly PaymentMethod[],
  ) {}

  async get(ref: string): Promise<SimulatedPayment | null> {
    const raw = await this.redis.get(KEY(ref));
    return raw ? (JSON.parse(raw) as SimulatedPayment) : null;
  }

  private async save(p: SimulatedPayment) {
    await this.redis.set(KEY(p.ref), JSON.stringify(p), 'EX', TTL_SECONDS);
  }

  async createSession(input: PaymentSessionInput): Promise<PaymentSession> {
    const ref = `sim_${randomBytes(12).toString('hex')}`;
    await this.save({ ref, method: input.method, status: 'PENDING', amount: input.amount, refunded: 0, orderNumber: input.order.number, locale: input.order.locale, returnUrl: input.returnUrl });
    return { providerRef: ref, redirectUrl: `${this.apiPublicUrl}/api/v1/payments/simulator/${ref}` };
  }

  /** Called by the simulator page when the tester chooses an outcome. */
  async complete(ref: string, outcome: 'pay' | 'decline' | 'cancel'): Promise<SimulatedPayment> {
    const p = await this.get(ref);
    if (!p) throw new GatewayError(this.provider, 'unknown session', 404);
    if (p.status === 'PENDING') {
      p.status = outcome === 'pay' ? (p.method === 'CARD' ? 'CAPTURED' : 'AUTHORIZED') : outcome === 'decline' ? 'FAILED' : 'CANCELLED';
      await this.save(p);
    }
    return p;
  }

  async verify(ref: string): Promise<PaymentVerification> {
    const p = await this.get(ref);
    if (!p) throw new GatewayError(this.provider, 'unknown session', 404);
    return {
      status: p.status,
      amount: p.amount,
      sourceSummary: p.method === 'CARD' ? 'mada 1111' : p.method === 'TABBY' ? 'Tabby' : 'Tamara',
      failureReason: p.status === 'FAILED' ? 'Card declined (simulator)' : undefined,
    };
  }

  async capture(ref: string, amount: number): Promise<PaymentVerification> {
    const p = await this.get(ref);
    if (!p) throw new GatewayError(this.provider, 'unknown session', 404);
    if (p.status !== 'AUTHORIZED' && p.status !== 'CAPTURED') throw new GatewayError(this.provider, `cannot capture a ${p.status} payment`, 409);
    if (amount !== p.amount) throw new GatewayError(this.provider, 'capture amount mismatch', 422);
    p.status = 'CAPTURED';
    await this.save(p);
    return this.verify(ref);
  }

  async refund(ref: string, amount: number): Promise<{ providerRef?: string }> {
    const p = await this.get(ref);
    if (!p || p.status !== 'CAPTURED') throw new GatewayError(this.provider, 'nothing to refund', 409);
    if (p.refunded + amount > p.amount) throw new GatewayError(this.provider, 'refund exceeds captured amount', 422);
    p.refunded += amount;
    await this.save(p);
    return { providerRef: `simref_${randomBytes(6).toString('hex')}` };
  }

  async cancel(ref: string): Promise<void> {
    const p = await this.get(ref);
    if (p && (p.status === 'PENDING' || p.status === 'AUTHORIZED')) {
      p.status = 'CANCELLED';
      await this.save(p);
    }
  }

  parseWebhook(): WebhookNotice | null {
    return null;
  }
}

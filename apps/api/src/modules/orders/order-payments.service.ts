import { Injectable, Logger } from '@nestjs/common';
import type { Order, OrderItem, Payment, PaymentProvider, Prisma } from '@prisma/client';
import { AppConfig } from '../../core/config/app-config.service';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { GatewayError, type PaymentGateway, type WebhookRequest } from '../payments/payment-gateway.port';
import { PaymentGateways } from '../payments/payment-gateways';
import { OrdersService } from './orders.service';

type OrderForPayment = Order & { items: OrderItem[] };

/**
 * Hosted-payment orchestration: opens gateway sessions, and turns redirects, webhooks and polling
 * into verified payment state. Nothing is trusted from the browser or the webhook body: the
 * gateway is always asked for the payment's real status.
 */
@Injectable()
export class OrderPaymentsService {
  private readonly logger = new Logger(OrderPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: PaymentGateways,
    private readonly orders: OrdersService,
    private readonly config: AppConfig,
  ) {}

  returnUrl(order: Pick<Order, 'id' | 'locale'>): string {
    return `${this.config.get('STOREFRONT_URL')}/${order.locale}/checkout/return?order=${order.id}`;
  }

  notificationUrl(provider: PaymentProvider): string {
    return `${this.config.get('API_PUBLIC_URL')}/api/v1/payments/webhooks/${provider.toLowerCase()}`;
  }

  /** Open a hosted payment session for an unpaid prepaid order. */
  async start(orderId: string): Promise<{ redirectUrl: string; paymentId: string }> {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { orderBy: { sortOrder: 'asc' } }, user: { select: { createdAt: true } } } });
    if (order.status !== 'NEW' || order.paymentState !== 'UNPAID' || order.paymentMethod === 'COD') throw AppError.badRequest('orderNotPayable');
    if (order.expiresAt && order.expiresAt <= new Date()) throw AppError.badRequest('orderNotPayable', { reason: 'expired' });
    const gateway = this.gateways.forMethod(order.paymentMethod);
    if (!gateway) throw AppError.badRequest('paymentMethodUnavailable', { method: order.paymentMethod });

    // A session left open in another tab may have been paid: check before replacing it.
    const open = await this.prisma.payment.findMany({ where: { orderId, status: { in: ['PENDING', 'AUTHORIZED'] } } });
    for (const p of open) {
      await this.sync(p).catch((err) => this.logger.warn({ err, paymentId: p.id }, 'Could not verify previous session'));
      const fresh = await this.prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
      if (fresh.status === 'CAPTURED') throw AppError.badRequest('orderNotPayable', { reason: 'alreadyPaid' });
      if (fresh.status === 'PENDING' || fresh.status === 'AUTHORIZED') {
        await this.prisma.payment.update({ where: { id: p.id }, data: { status: 'CANCELLED' } });
        if (fresh.providerRef) await this.gateways.get(fresh.provider)?.cancel(fresh.providerRef).catch(() => undefined);
      }
    }

    const payment = await this.prisma.payment.create({ data: { orderId, provider: gateway.provider, method: order.paymentMethod, amount: order.total } });
    try {
      const session = await gateway.createSession({
        paymentId: payment.id,
        method: order.paymentMethod,
        amount: order.total,
        order: this.sessionOrder(order, order.user?.createdAt),
        returnUrl: this.returnUrl(order),
        notificationUrl: this.notificationUrl(gateway.provider),
      });
      await this.prisma.payment.update({ where: { id: payment.id }, data: { providerRef: session.providerRef, redirectUrl: session.redirectUrl, raw: (session.raw ?? undefined) as Prisma.InputJsonValue | undefined } });
      return { redirectUrl: session.redirectUrl, paymentId: payment.id };
    } catch (err) {
      const rejected = err instanceof GatewayError && (err.body as { rejected?: boolean } | undefined)?.rejected;
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureCode: rejected ? 'rejected' : 'sessionError', failureReason: (err as Error).message.slice(0, 500) } });
      this.logger.error({ err, orderId }, 'Could not open a payment session');
      if (rejected) throw AppError.badRequest('paymentMethodUnavailable', { method: order.paymentMethod, reason: 'rejected' });
      throw new AppError('paymentProviderError', 502);
    }
  }

  private sessionOrder(order: OrderForPayment, customerSince?: Date) {
    const address = order.shippingAddress as { street?: string; district?: string; cityNameEn?: string; cityNameAr?: string; postalCode?: string; buildingNo?: string } | null;
    return {
      id: order.id,
      number: order.number,
      locale: order.locale,
      net: order.net,
      vat: order.vat,
      shippingTotal: order.shippingTotal + order.codFee,
      discount: order.discount,
      contactName: order.contactName,
      contactPhoneE164: order.contactPhoneE164,
      contactEmail: order.contactEmail,
      placedAt: order.placedAt,
      expiresAt: order.expiresAt,
      address: address ? { line1: [address.buildingNo, address.street, address.district].filter(Boolean).join(', ') || '-', city: address.cityNameEn ?? address.cityNameAr ?? '', postalCode: address.postalCode } : null,
      items: order.items.map((i) => ({
        sku: i.sku,
        name: order.locale === 'en' ? (i.nameEn ?? i.nameAr) : i.nameAr,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.total,
        vat: i.vat,
        discount: i.discount,
      })),
      customerSince,
    };
  }

  /** Verify the order's latest open payment with its gateway (return page, polling, expiry job). */
  async syncOrder(orderId: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({ where: { orderId, status: { in: ['PENDING', 'AUTHORIZED', 'CAPTURED'] }, providerRef: { not: null } }, orderBy: { createdAt: 'desc' } });
    if (payment) await this.sync(payment);
  }

  async sync(payment: Payment): Promise<void> {
    const gateway = this.gateways.get(payment.provider);
    if (!gateway || !payment.providerRef) return;
    let v = await gateway.verify(payment.providerRef);
    if (v.status === 'AUTHORIZED') {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'AUTHORIZED', authorizedAt: new Date() } });
      // BNPL: capture immediately; the order is a firm sale once the customer approves the plan.
      v = await this.capture(gateway, payment);
    }
    switch (v.status) {
      case 'CAPTURED':
        await this.orders.markPaid(payment.id, v);
        break;
      case 'FAILED':
      case 'CANCELLED':
      case 'EXPIRED':
        if (payment.status === 'PENDING' || payment.status === 'AUTHORIZED') {
          await this.prisma.payment.update({ where: { id: payment.id }, data: { status: v.status, failureReason: v.failureReason?.slice(0, 500) } });
        }
        break;
      default:
        break;
    }
  }

  private async capture(gateway: PaymentGateway, payment: Payment) {
    try {
      return await gateway.capture(payment.providerRef!, payment.amount);
    } catch (err) {
      this.logger.error({ err, paymentId: payment.id }, 'Capture failed; will retry on next verification');
      return { status: 'AUTHORIZED' as const };
    }
  }

  /** Authenticated, deduplicated gateway notifications. */
  async handleWebhook(provider: PaymentProvider, req: WebhookRequest): Promise<{ received: true }> {
    const gateway = this.gateways.get(provider);
    if (!gateway || provider === 'SIMULATOR') throw AppError.notFound();
    let notice;
    try {
      notice = gateway.parseWebhook(req);
    } catch (err) {
      this.logger.warn({ provider, err: (err as Error).message }, 'Rejected webhook');
      throw AppError.unauthorized();
    }
    if (!notice) return { received: true };
    let event;
    try {
      event = await this.prisma.webhookEvent.create({ data: { provider, eventId: notice.eventId, type: notice.type, payload: (req.body ?? {}) as Prisma.InputJsonValue } });
    } catch {
      const existing = await this.prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider, eventId: notice.eventId } } });
      if (existing?.processedAt) return { received: true };
      event = existing!;
    }
    const payment = await this.prisma.payment.findUnique({ where: { provider_providerRef: { provider, providerRef: notice.providerRef } } });
    try {
      if (payment) await this.sync(payment);
      await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), error: payment ? null : 'unknown payment' } });
    } catch (err) {
      await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { error: (err as Error).message.slice(0, 500) } });
      // A 5xx makes the gateway retry the delivery.
      throw err;
    }
    return { received: true };
  }
}

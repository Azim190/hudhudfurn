import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { canTransition, type OrderStatus } from '@hudhud/domain';
import { Prisma, type Order } from '@prisma/client';
import type { Queue } from 'bullmq';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../../core/config/app-config.service';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { QUEUES } from '../../core/queue/queue.module';
import { InvoicingService } from '../invoicing/invoicing.service';
import { PaymentGateways } from '../payments/payment-gateways';
import type { PaymentVerification } from '../payments/payment-gateway.port';
import { PromotionsService } from '../promotions/promotions.service';
import { SearchSync } from '../search/search-sync';
import type { AdminOrderQueryDto } from './orders.dto';
import { StockLedger } from './stock-ledger';

export const ORDER_DETAIL_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'desc' } },
  refunds: { orderBy: { createdAt: 'desc' } },
  invoices: { orderBy: { icv: 'asc' }, select: { id: true, kind: true, number: true, issuedAt: true, total: true, zatcaStatus: true } },
  pickupLocation: { select: { id: true, code: true, nameAr: true, nameEn: true } },
} satisfies Prisma.OrderInclude;

type OrderDetail = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;

export interface OrderViewer {
  userId?: string;
  accessToken?: string;
}

/** Order lifecycle after placement: payment confirmation, cancellation, status changes and reads. */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly accessKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockLedger,
    private readonly promotions: PromotionsService,
    private readonly invoicing: InvoicingService,
    private readonly gateways: PaymentGateways,
    private readonly search: SearchSync,
    @InjectQueue(QUEUES.invoicing) private readonly invoicingQueue: Queue,
    config: AppConfig,
  ) {
    this.accessKey = createHmac('sha256', Buffer.from(config.get('ENCRYPTION_KEY'), 'base64')).update('order-access-token').digest();
  }

  // ───── Guest access ─────

  /** Bearer token that lets a guest view one order (confirmation page, invoice). */
  accessToken(orderId: string): string {
    return createHmac('sha256', this.accessKey).update(orderId).digest('base64url');
  }

  async findForViewer(orderId: string, viewer: OrderViewer): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE });
    if (!order || !this.canView(order, viewer)) throw AppError.notFound({ entity: 'order' });
    return order;
  }

  private canView(order: Pick<Order, 'id' | 'userId'>, viewer: OrderViewer): boolean {
    if (viewer.userId && order.userId === viewer.userId) return true;
    if (!viewer.accessToken) return false;
    const expected = Buffer.from(this.accessToken(order.id));
    const given = Buffer.from(viewer.accessToken);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  // ───── Payment outcome ─────

  /**
   * Apply a verified, captured payment. Runs under a lock on the order, so redirects, webhooks
   * and the expiry job can race safely; only the first one changes anything.
   */
  async markPaid(paymentId: string, v: PaymentVerification): Promise<'paid' | 'already' | 'mismatch' | 'cancelled'> {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const outcome = await this.prisma.$transaction(async (tx) => {
      const [o] = await tx.$queryRaw<Array<{ status: OrderStatus; payment_state: string; total: number }>>`
        SELECT status, payment_state, total FROM orders WHERE id = ${payment.orderId}::uuid FOR UPDATE`;
      const captured = { status: 'CAPTURED' as const, capturedAt: new Date(), sourceSummary: v.sourceSummary, raw: (v.raw ?? undefined) as Prisma.InputJsonValue | undefined, failureCode: null, failureReason: null };
      if (o!.payment_state === 'PAID') {
        await tx.payment.update({ where: { id: paymentId }, data: captured });
        return 'already' as const;
      }
      if (v.amount !== undefined && v.amount !== o!.total) {
        await tx.payment.update({ where: { id: paymentId }, data: { status: 'CAPTURED', capturedAt: new Date(), failureCode: 'amountMismatch', failureReason: `Gateway reported ${v.amount}, order total ${o!.total}` } });
        return 'mismatch' as const;
      }
      await tx.payment.update({ where: { id: paymentId }, data: captured });
      if (o!.status === 'CANCELLED') return 'cancelled' as const;
      await tx.order.update({ where: { id: payment.orderId }, data: { status: 'PAID', paymentState: 'PAID', paidAt: new Date(), expiresAt: null } });
      await tx.orderStatusEvent.create({ data: { orderId: payment.orderId, fromStatus: o!.status, toStatus: 'PAID', note: `payment:${payment.provider}` } });
      await this.stock.commit(tx, payment.orderId);
      return 'paid' as const;
    });

    if (outcome === 'paid') {
      await this.issueInvoice(payment.orderId);
      await this.syncProducts(payment.orderId);
    } else if (outcome === 'cancelled') {
      // Paid after the order had already expired: give the money back.
      this.logger.warn({ orderId: payment.orderId, paymentId }, 'Payment captured for a cancelled order; refunding');
      await this.refundPayment(paymentId, payment.amount, 'Order expired before payment completed', undefined);
    } else if (outcome === 'mismatch') {
      this.logger.error({ orderId: payment.orderId, paymentId, amount: v.amount }, 'Captured amount does not match the order total');
    }
    return outcome;
  }

  private async issueInvoice(orderId: string) {
    try {
      await this.invoicing.issueForOrder(orderId);
    } catch (err) {
      this.logger.error({ err, orderId }, 'Invoice issuance failed; retrying in the background');
      await this.invoicingQueue.add('issue', { orderId }, { jobId: `issue:${orderId}`, attempts: 20, backoff: { type: 'exponential', delay: 10_000 } }).catch(() => undefined);
    }
  }

  private async syncProducts(orderId: string) {
    const items = await this.prisma.orderItem.findMany({ where: { orderId }, select: { productId: true } });
    await this.search.products(items.map((i) => i.productId).filter((id): id is string => Boolean(id)));
  }

  // ───── Cancellation and status changes ─────

  async cancel(orderId: string, input: { reason: string; actorId?: string; byCustomer?: boolean }) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, items: true } });
    if (!order) throw AppError.notFound({ entity: 'order' });
    if (!canTransition(order.status, 'CANCELLED')) throw AppError.badRequest('orderTransitionInvalid', { from: order.status, to: 'CANCELLED' });
    // Customers may only cancel before production or dispatch starts.
    if (input.byCustomer && !['NEW', 'PAID', 'CONFIRMED'].includes(order.status)) throw AppError.badRequest('orderTransitionInvalid', { from: order.status, to: 'CANCELLED' });

    const touched = await this.prisma.$transaction(async (tx) => {
      const [o] = await tx.$queryRaw<Array<{ status: OrderStatus }>>`SELECT status FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      if (!canTransition(o!.status, 'CANCELLED')) throw AppError.badRequest('orderTransitionInvalid', { from: o!.status, to: 'CANCELLED' });
      const released = await this.stock.release(tx, orderId);
      const restocked = await this.stock.restock(tx, orderId);
      await this.promotions.release(tx, orderId);
      await tx.payment.updateMany({ where: { orderId, status: { in: ['PENDING', 'AUTHORIZED'] } }, data: { status: 'CANCELLED' } });
      await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: input.reason, expiresAt: null } });
      await tx.orderStatusEvent.create({ data: { orderId, fromStatus: o!.status, toStatus: 'CANCELLED', actorId: input.actorId, note: input.reason } });
      return [...released, ...restocked];
    });

    // Void open gateway sessions and refund what was captured.
    for (const p of order.payments) {
      const gateway = this.gateways.get(p.provider);
      if (!gateway || !p.providerRef) continue;
      if (p.status === 'PENDING' || p.status === 'AUTHORIZED') await gateway.cancel(p.providerRef).catch((err) => this.logger.warn({ err, paymentId: p.id }, 'Could not void payment session'));
    }
    const captured = order.payments.find((p) => p.status === 'CAPTURED' && !p.failureCode);
    if (captured) {
      const refundable = captured.amount - order.refundedTotal;
      if (refundable > 0) await this.refundPayment(captured.id, refundable, input.reason, input.actorId);
    }
    if (order.paymentState === 'PAID') await this.issueCreditNote(orderId, input.reason);
    if (touched.length) await this.syncProducts(orderId);
    return this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE });
  }

  private async issueCreditNote(orderId: string, reason: string) {
    try {
      await this.invoicing.issueCreditNote(orderId, reason);
    } catch (err) {
      this.logger.error({ err, orderId }, 'Credit note issuance failed; retrying in the background');
      await this.invoicingQueue.add('credit', { orderId, reason }, { jobId: `credit:${orderId}`, attempts: 20, backoff: { type: 'exponential', delay: 10_000 } }).catch(() => undefined);
    }
  }

  /** Refund through the gateway that took the payment and record the outcome. */
  async refundPayment(paymentId: string, amount: number, reason: string, actorId: string | undefined) {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const gateway = this.gateways.get(payment.provider);
    const refund = await this.prisma.refund.create({ data: { orderId: payment.orderId, paymentId, amount, reason, actorId } });
    if (!gateway || !payment.providerRef) {
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } });
      throw AppError.badRequest('refundFailed', { reason: 'gatewayUnavailable' });
    }
    try {
      const res = await gateway.refund(payment.providerRef, amount, reason);
      await this.prisma.$transaction(async (tx) => {
        await tx.refund.update({ where: { id: refund.id }, data: { status: 'SUCCEEDED', providerRef: res.providerRef } });
        const order = await tx.order.update({ where: { id: payment.orderId }, data: { refundedTotal: { increment: amount } } });
        const full = order.refundedTotal >= order.total;
        await tx.order.update({ where: { id: order.id }, data: { paymentState: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
        await tx.payment.update({ where: { id: paymentId }, data: { status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
      });
    } catch (err) {
      this.logger.error({ err, paymentId }, 'Refund failed');
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } });
      throw AppError.badRequest('refundFailed');
    }
  }

  /** Staff status changes along the lifecycle. Delivery of a COD order collects the payment and issues the invoice. */
  async transition(orderId: string, to: OrderStatus, actorId: string, note?: string) {
    if (to === 'CANCELLED') return this.cancel(orderId, { reason: note ?? 'Cancelled by staff', actorId });
    if (to === 'PAID' || to === 'CONFIRMED' || to === 'NEW') throw AppError.badRequest('orderTransitionInvalid', { to });
    let codDelivered = false;
    await this.prisma.$transaction(async (tx) => {
      const [o] = await tx.$queryRaw<Array<{ status: OrderStatus; payment_method: string }>>`SELECT status, payment_method FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      if (!o) throw AppError.notFound({ entity: 'order' });
      if (!canTransition(o.status, to)) throw AppError.badRequest('orderTransitionInvalid', { from: o.status, to });
      const data: Prisma.OrderUpdateInput = { status: to };
      if (to === 'DELIVERED') {
        data.deliveredAt = new Date();
        if (o.payment_method === 'COD') {
          data.paymentState = 'PAID';
          data.paidAt = new Date();
          codDelivered = true;
          await tx.payment.updateMany({ where: { orderId, provider: 'COD', status: 'PENDING' }, data: { status: 'CAPTURED', capturedAt: new Date() } });
        }
      }
      await tx.order.update({ where: { id: orderId }, data });
      await tx.orderStatusEvent.create({ data: { orderId, fromStatus: o.status, toStatus: to, actorId, note } });
    });
    if (codDelivered) await this.issueInvoice(orderId);
    return this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE });
  }

  /** Cancel prepaid orders whose payment window passed (after one last check with the gateway). */
  async expireUnpaid(verify: (orderId: string) => Promise<void>): Promise<number> {
    const due = await this.prisma.order.findMany({ where: { status: 'NEW', paymentState: 'UNPAID', expiresAt: { lt: new Date() } }, select: { id: true }, take: 100 });
    let expired = 0;
    for (const { id } of due) {
      try {
        await verify(id);
        const fresh = await this.prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true } });
        if (fresh.status !== 'NEW') continue;
        await this.cancel(id, { reason: 'Payment not completed in time' });
        await this.prisma.payment.updateMany({ where: { orderId: id, status: 'CANCELLED' }, data: { status: 'EXPIRED' } });
        expired++;
      } catch (err) {
        this.logger.error({ err, orderId: id }, 'Could not expire order');
      }
    }
    return expired;
  }

  // ───── Reads ─────

  async listForCustomer(userId: string, page: number, limit: number) {
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: { orderBy: { sortOrder: 'asc' }, take: 4, select: { nameAr: true, nameEn: true, imageUrl: true, quantity: true } }, _count: { select: { items: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: items.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        paymentState: o.paymentState,
        paymentMethod: o.paymentMethod,
        placedAt: o.placedAt,
        total: o.total,
        itemCount: o._count.items,
        preview: o.items,
      })),
      total,
      page,
      limit,
    };
  }

  async adminList(q: AdminOrderQueryDto) {
    const search = q.q?.trim();
    const where: Prisma.OrderWhereInput = {
      status: q.status,
      paymentMethod: q.paymentMethod,
      paymentState: q.paymentState,
      ...(search
        ? { OR: [{ number: { contains: search.toUpperCase() } }, { contactPhoneE164: { contains: search.replace(/\D/g, '') || search } }, { contactName: { contains: search, mode: 'insensitive' } }] }
        : {}),
      ...(q.from || q.to ? { placedAt: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: { id: true, number: true, status: true, paymentMethod: true, paymentState: true, fulfillment: true, contactName: true, contactPhoneE164: true, cityCode: true, total: true, placedAt: true, _count: { select: { items: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }

  async adminGet(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_DETAIL_INCLUDE });
    if (!order) throw AppError.notFound({ entity: 'order' });
    return { ...this.present(order), contact: { name: order.contactName, phoneE164: order.contactPhoneE164, email: order.contactEmail }, userId: order.userId, events: order.events, payments: order.payments, refunds: order.refunds, customerNote: order.customerNote };
  }

  /** Customer-facing view (also used by the admin detail). */
  present(order: OrderDetail) {
    const pricing = order.pricing as { promotions?: unknown[]; shipping?: { gross: number }; codFee?: { gross: number } };
    const payment = order.payments[0];
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentState: order.paymentState,
      fulfillment: order.fulfillment,
      locale: order.locale,
      placedAt: order.placedAt,
      paidAt: order.paidAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      expiresAt: order.expiresAt,
      contactName: order.contactName,
      shippingAddress: order.shippingAddress,
      pickupLocation: order.pickupLocation,
      shipping: order.fulfillment === 'DELIVERY' ? { nameAr: order.shippingNameAr, nameEn: order.shippingNameEn, carrier: order.shippingCarrier, method: order.shippingMethod } : null,
      eta: order.etaMinDays !== null ? { minDays: order.etaMinDays, maxDays: order.etaMaxDays } : null,
      items: order.items.map((i) => ({
        id: i.id,
        sku: i.sku,
        nameAr: i.nameAr,
        nameEn: i.nameEn,
        options: i.options,
        imageUrl: i.imageUrl,
        isSample: i.isSample,
        isMadeToMeasure: i.isMadeToMeasure,
        pricingMode: i.pricingMode,
        lengthCm: i.lengthCm,
        widthMm: i.widthMm,
        heightMm: i.heightMm,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        giftWrap: i.giftWrap,
        giftWrapTotal: i.giftWrapTotal,
        giftMessage: i.giftMessage,
        configuration: i.configuration,
        total: i.total,
      })),
      totals: {
        subtotal: order.subtotal,
        discount: order.discount,
        giftWrap: order.giftWrapTotal,
        shipping: order.shippingTotal,
        codFee: order.codFee,
        net: order.net,
        vat: order.vat,
        total: order.total,
        refunded: order.refundedTotal,
      },
      vatRateBp: order.vatRateBp,
      pricesIncludeVat: order.pricesIncludeVat,
      couponCode: order.couponCode,
      promotions: pricing.promotions ?? [],
      timeline: order.events.map((e) => ({ status: e.toStatus, at: e.createdAt })),
      invoices: order.invoices,
      payment: payment ? { status: payment.status, provider: payment.provider, sourceSummary: payment.sourceSummary, failureReason: payment.failureReason } : null,
      canRetryPayment: order.status === 'NEW' && order.paymentState === 'UNPAID' && order.paymentMethod !== 'COD' && (!order.expiresAt || order.expiresAt > new Date()),
      canCancel: ['NEW', 'PAID', 'CONFIRMED'].includes(order.status),
    };
  }
}

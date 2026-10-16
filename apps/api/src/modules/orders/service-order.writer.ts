import { Injectable } from '@nestjs/common';
import { allocate, computeCheckoutTotals } from '@hudhud/domain';
import type { PaymentMethod, Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { nextCounter, riyadhYear, sequenceNumber } from '../../core/prisma/document-counter';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PaymentGateways } from '../payments/payment-gateways';
import { SettingsService } from '../settings/settings.service';
import { OrderPaymentsService } from './order-payments.service';
import { OrdersService } from './orders.service';

export interface ServiceOrderLine {
  sku: string;
  nameAr: string;
  nameEn: string;
  quantity: number;
  /** Price per unit in the store's price basis (VAT-inclusive by default). */
  unitPrice: number;
  productId?: string;
  variantId?: string;
  configurationId?: string;
  configuration?: Prisma.InputJsonValue;
  isMadeToMeasure: boolean;
}

export interface ServiceOrderInput {
  userId: string;
  locale: 'ar' | 'en';
  contact: { name: string; phoneE164: string; email: string | null };
  address: Record<string, unknown> & { cityCode: string };
  lines: ServiceOrderLine[];
  /** Order-level credit (e.g. a paid visit fee), spread over the lines. */
  credit?: number;
  paymentMethod: PaymentMethod;
  note?: string;
}

/**
 * Orders that do not come from a cart: measurement-visit fees and accepted quotations. They go
 * through the same order, payment, invoicing and refund pipeline as checkout orders, delivered and
 * installed by our own team (no shipping charge, no stock reservation).
 */
@Injectable()
export class ServiceOrderWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly gateways: PaymentGateways,
    private readonly payments: OrderPaymentsService,
    private readonly orders: OrdersService,
  ) {}

  /** Prepaid methods usable for this amount (no cash: made-to-order work and visits are paid upfront). */
  async availableMethods(total: number): Promise<PaymentMethod[]> {
    const [methods, bnpl] = await Promise.all([this.settings.get('payments.methods'), this.settings.get('payments.bnpl')]);
    const out: PaymentMethod[] = [];
    if (methods.card && this.gateways.forMethod('CARD')) out.push('CARD');
    for (const [m, on] of [['TABBY', methods.tabby], ['TAMARA', methods.tamara]] as const) {
      if (on && this.gateways.forMethod(m) && total >= bnpl.minTotalHalalas && total <= bnpl.maxTotalHalalas) out.push(m);
    }
    return out;
  }

  async create(input: ServiceOrderInput): Promise<{ orderId: string; number: string; total: number; redirectUrl: string }> {
    if (input.lines.length === 0) throw AppError.badRequest('cartEmpty');
    const [vat, payment] = await Promise.all([this.settings.get('tax.vat'), this.settings.get('checkout.payment')]);
    const ids = input.lines.map((_, i) => `l${i}`);
    const gross = input.lines.map((l) => l.unitPrice * l.quantity);
    const credit = Math.min(input.credit ?? 0, gross.reduce((a, b) => a + b, 0));
    const parts = credit > 0 ? allocate(credit, gross) : gross.map(() => 0);
    const totals = computeCheckoutTotals({
      lines: input.lines.map((l, i) => ({ id: ids[i]!, pricingMode: 'FIXED', unitPrice: l.unitPrice, quantity: l.quantity })),
      lineDiscounts: Object.fromEntries(ids.map((id, i) => [id, parts[i]!])),
      shipping: 0,
      codFee: 0,
      settings: { vatRateBp: vat.rateBp, pricesIncludeVat: vat.pricesIncludeVat, giftWrapPrice: null },
    });
    const methods = await this.availableMethods(totals.total);
    if (!methods.includes(input.paymentMethod)) throw AppError.badRequest('paymentMethodUnavailable', { method: input.paymentMethod });
    if ((input.paymentMethod === 'TABBY' || input.paymentMethod === 'TAMARA') && !input.contact.email) throw AppError.badRequest('validation', { field: 'contact.email', reason: 'requiredForInstalments' });

    const order = await this.prisma.$transaction(async (tx) => {
      const year = riyadhYear();
      const number = sequenceNumber('HD', year, await nextCounter(tx, `order:${year}`));
      return tx.order.create({
        data: {
          number,
          userId: input.userId,
          locale: input.locale,
          contactName: input.contact.name,
          contactPhoneE164: input.contact.phoneE164,
          contactEmail: input.contact.email,
          paymentMethod: input.paymentMethod,
          fulfillment: 'DELIVERY',
          shippingAddress: input.address as Prisma.InputJsonValue,
          cityCode: input.address.cityCode,
          shippingCarrier: 'OWN_FLEET',
          shippingMethod: 'INSTALLATION',
          vatRateBp: vat.rateBp,
          pricesIncludeVat: vat.pricesIncludeVat,
          subtotal: totals.subtotal,
          discount: totals.discount,
          net: totals.net,
          vat: totals.vat,
          total: totals.total,
          pricing: { promotions: [], vatBreakdown: totals.vatBreakdown, shipping: totals.shipping, codFee: totals.codFee } as unknown as Prisma.InputJsonValue,
          customerNote: input.note,
          expiresAt: new Date(Date.now() + payment.unpaidTtlMinutes * 60_000),
          items: {
            create: input.lines.map((l, i) => {
              const p = totals.cart.lines[i]!;
              return {
                sku: l.sku,
                nameAr: l.nameAr,
                nameEn: l.nameEn,
                productId: l.productId,
                variantId: l.variantId,
                pricingMode: 'FIXED' as const,
                isMadeToMeasure: l.isMadeToMeasure,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discount: p.discount,
                net: p.vat.net,
                vat: p.vat.vat,
                vatRateBp: p.vat.rateBp,
                total: p.total,
                configurationId: l.configurationId,
                configuration: l.configuration,
                sortOrder: i,
              };
            }),
          },
          events: { create: { toStatus: 'NEW', note: 'service order' } },
        },
      });
    });

    try {
      const { redirectUrl } = await this.payments.start(order.id);
      return { orderId: order.id, number: order.number, total: order.total, redirectUrl };
    } catch (err) {
      await this.orders.cancel(order.id, { reason: 'Payment session could not be opened' }).catch(() => undefined);
      throw err;
    }
  }
}

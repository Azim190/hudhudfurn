import { Injectable } from '@nestjs/common';
import { mountingChoice, quotationTotals, type MeasuredMounting } from '@hudhud/domain';
import type { Locale } from '@hudhud/i18n';
import type { PaymentMethod, Prisma, Quotation } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { nextCounter, riyadhYear, sequenceNumber } from '../../core/prisma/document-counter';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ConfiguratorService } from '../configurator/configurator.service';
import { OrdersService } from '../orders/orders.service';
import { ServiceOrderWriter } from '../orders/service-order.writer';
import { SettingsService } from '../settings/settings.service';
import type { QuotationDto } from './services.dto';
import { ServicesService } from './services.service';

const LINES = { lines: { orderBy: { sortOrder: 'asc' }, include: { configuration: true } }, booking: { select: { id: true, number: true, type: true, address: true, contactName: true, contactPhoneE164: true } } } satisfies Prisma.QuotationInclude;

/**
 * Quotations from measured windows. Lines are priced with the configurator at creation and locked
 * until `validUntil`. Accepting creates a prepaid order (installation by our team) for the total,
 * minus the measurement-visit fee when it was paid within the credit window.
 */
@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurator: ConfiguratorService,
    private readonly settings: SettingsService,
    private readonly services: ServicesService,
    private readonly serviceOrders: ServiceOrderWriter,
    orders: OrdersService,
  ) {
    // A cancelled or expired quotation order reopens the quotation while it is still valid.
    orders.onCancelled(async (orderId) => {
      const q = await this.prisma.quotation.findUnique({ where: { orderId } });
      if (q?.status === 'ACCEPTED') await this.prisma.quotation.update({ where: { id: q.id }, data: { status: q.validUntil > new Date() ? 'SENT' : 'EXPIRED', orderId: null, acceptedAt: null } });
    });
  }

  /** Created by the technician on site (or staff later) and sent to the customer right away. */
  async create(bookingId: string, dto: QuotationDto, actorId: string, restrictToTechnician?: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { measurements: true, feeOrder: { select: { paymentState: true, paidAt: true } } } });
    if (!booking || (restrictToTechnician && booking.technicianId !== restrictToTechnician)) throw AppError.notFound({ entity: 'booking' });
    if (!['IN_PROGRESS', 'COMPLETED'].includes(booking.status)) throw AppError.badRequest('bookingLocked');
    const rules = await this.settings.get('services.booking');

    const lines: Prisma.QuotationLineUncheckedCreateWithoutQuotationInput[] = [];
    for (const [i, l] of dto.lines.entries()) {
      const m = l.measurementId ? booking.measurements.find((x) => x.id === l.measurementId) : undefined;
      if (l.measurementId && !m) throw AppError.badRequest('validation', { field: `lines.${i}.measurementId` });
      // The measured size wins over anything typed in the inputs; the measured mounting fills in the
      // template's matching option unless one was chosen.
      let inputs = l.inputs;
      if (m) {
        const codes = (await this.prisma.configuratorOption.findMany({ where: { template: { products: { some: { id: l.productId } } }, group: 'MOUNTING', isActive: true }, select: { code: true } })).map((o) => o.code);
        const mounting = l.inputs.choices?.MOUNTING ?? mountingChoice(m.mounting as MeasuredMounting, codes);
        inputs = { ...l.inputs, widthMm: m.widthMm, heightMm: m.heightMm, choices: { ...l.inputs.choices, ...(mounting ? { MOUNTING: mounting } : {}) } };
      }
      const product = await this.prisma.product.findUnique({ where: { id: l.productId }, select: { nameAr: true, nameEn: true } });
      if (!product) throw AppError.badRequest('validation', { field: `lines.${i}.productId` });
      const configuration = await this.configurator.create(l.productId, l.variantId, inputs, booking.userId).catch((err) => {
        throw err instanceof AppError ? AppError.badRequest(err.code, { ...err.details, line: i }) : err;
      });
      lines.push({ measurementId: m?.id, productId: l.productId, variantId: l.variantId, configurationId: configuration.id, nameAr: m ? `${product.nameAr} — ${m.roomLabel}` : product.nameAr, nameEn: product.nameEn ? (m ? `${product.nameEn} — ${m.roomLabel}` : product.nameEn) : null, quantity: l.quantity, unitPrice: configuration.total, sortOrder: i });
    }
    // The visit fee counts towards the quotation when it was paid within the credit window.
    const feePaid = booking.type === 'MEASUREMENT' && booking.feeOrder?.paymentState === 'PAID' && booking.feeOrder.paidAt && Date.now() - booking.feeOrder.paidAt.getTime() <= rules.visitCreditDays * 86_400_000;
    const totals = quotationTotals(lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity })), feePaid ? booking.fee : 0);

    const q = await this.prisma.$transaction(async (tx) => {
      await tx.quotation.updateMany({ where: { bookingId, status: { in: ['DRAFT', 'SENT'] } }, data: { status: 'CANCELLED' } });
      const year = riyadhYear();
      const number = sequenceNumber('QT', year, await nextCounter(tx, `quotation:${year}`));
      return tx.quotation.create({
        data: {
          number,
          bookingId,
          userId: booking.userId,
          status: 'SENT',
          sentAt: new Date(),
          validUntil: new Date(Date.now() + rules.quotationValidityDays * 86_400_000),
          subtotal: totals.subtotal,
          credit: totals.credit,
          total: totals.total,
          notes: dto.notes?.trim() || null,
          createdById: actorId,
          lines: { create: lines },
        },
      });
    });
    await this.services.notify(booking, 'quotationReady', { quotation: q.number, url: this.services.storefrontUrl(`/${booking.locale}/quotations/${q.number}`) });
    return this.get(q.number);
  }

  async get(number: string, userId?: string) {
    const q = await this.prisma.quotation.findFirst({ where: { number, ...(userId ? { userId } : {}) }, include: LINES });
    if (!q) throw AppError.notFound({ entity: 'quotation' });
    const fresh = await this.expireIfDue(q);
    return {
      id: fresh.id,
      number: fresh.number,
      status: fresh.status,
      validUntil: fresh.validUntil,
      subtotal: fresh.subtotal,
      credit: fresh.credit,
      total: fresh.total,
      notes: fresh.notes,
      orderId: fresh.orderId,
      booking: q.booking,
      lines: q.lines.map((l) => {
        const computed = l.configuration.computed as { specs?: Record<string, number | string>; choices?: unknown[]; lines?: unknown[] };
        return { id: l.id, nameAr: l.nameAr, nameEn: l.nameEn, quantity: l.quantity, unitPrice: l.unitPrice, total: l.unitPrice * l.quantity, configuration: { kind: String(computed.specs?.kind ?? ''), specs: computed.specs ?? {}, choices: computed.choices ?? [], lines: computed.lines ?? [] } };
      }),
      paymentMethods: fresh.status === 'SENT' ? await this.services.methodsFor(fresh.total) : [],
    };
  }

  listMine(userId: string) {
    return this.prisma.quotation.findMany({ where: { userId, status: { not: 'DRAFT' } }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, number: true, status: true, total: true, validUntil: true, createdAt: true, booking: { select: { number: true } } } });
  }

  private async expireIfDue(q: Quotation) {
    if (q.status === 'SENT' && q.validUntil <= new Date()) return this.prisma.quotation.update({ where: { id: q.id }, data: { status: 'EXPIRED' } });
    return q;
  }

  /** Accept: a prepaid order with the locked prices and the workshop specs of every line. */
  /** `locale` is the language the customer is browsing in (payment page, order emails and SMS). */
  async accept(number: string, userId: string, paymentMethod: PaymentMethod, locale?: Locale) {
    const q = await this.prisma.quotation.findFirst({ where: { number, userId }, include: LINES });
    if (!q) throw AppError.notFound({ entity: 'quotation' });
    const fresh = await this.expireIfDue(q);
    if (fresh.status !== 'SENT') throw AppError.badRequest('quotationNotOpen', { status: fresh.status });
    // Claim the quotation first so a double click cannot create two orders.
    const claimed = await this.prisma.quotation.updateMany({ where: { id: q.id, status: 'SENT', orderId: null }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
    if (claimed.count === 0) throw AppError.conflict('requestInProgress');
    try {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const address = q.booking.address as Record<string, unknown> & { cityCode: string };
      const lines = [];
      for (const l of q.lines) {
        const variant = await this.prisma.productVariant.findUnique({ where: { id: l.variantId }, select: { sku: true } });
        lines.push({
          sku: variant?.sku ?? 'CUSTOM',
          nameAr: l.nameAr,
          nameEn: l.nameEn ?? l.nameAr,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          productId: l.productId,
          variantId: l.variantId,
          configurationId: l.configurationId,
          configuration: (await this.configurator.snapshotFromSaved(l.configuration)) as unknown as Prisma.InputJsonValue,
          isMadeToMeasure: true,
        });
      }
      const order = await this.serviceOrders.create({
        userId,
        locale: locale ?? user.locale,
        contact: { name: q.booking.contactName, phoneE164: q.booking.contactPhoneE164, email: user.email },
        address,
        lines,
        credit: q.credit,
        paymentMethod,
        note: `Quotation ${q.number}`,
      });
      await this.prisma.quotation.update({ where: { id: q.id }, data: { orderId: order.orderId } });
      return { orderId: order.orderId, number: order.number, redirectUrl: order.redirectUrl };
    } catch (err) {
      await this.prisma.quotation.updateMany({ where: { id: q.id, orderId: null }, data: { status: 'SENT', acceptedAt: null } });
      throw err;
    }
  }
}

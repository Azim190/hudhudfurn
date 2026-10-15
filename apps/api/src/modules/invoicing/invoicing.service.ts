import { createHash, randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  assertInvoiceBalances,
  buildInvoiceXml,
  INITIAL_PREVIOUS_HASH,
  invoiceHashInput,
  invoiceLineAmounts,
  isValidVatNumber,
  signatureExtensionXml,
  signedPropertiesXml,
  withXmlDeclaration,
  zatcaQr,
  zatcaTimestamp,
  type InvoiceDocument,
  type InvoiceLineDoc,
  type InvoiceParty,
} from '@hudhud/domain';
import type { Order, OrderItem, Prisma, TaxInvoice } from '@prisma/client';
import type { Queue } from 'bullmq';
import { AppError } from '../../core/errors/app-error';
import { nextCounter, riyadhYear, sequenceNumber } from '../../core/prisma/document-counter';
import { PrismaService } from '../../core/prisma/prisma.service';
import { QUEUES } from '../../core/queue/queue.module';
import { SettingsService } from '../settings/settings.service';
import { ZatcaClient } from './zatca-client';
import { ZatcaKeys } from './zatca-keys.service';

const CHAIN_ID = 'default';

export interface OrderPricingSnapshot {
  shipping?: { net: number; vat: number; gross: number };
  codFee?: { net: number; vat: number; gross: number };
  promotions?: Array<{ id: string; code?: string; type: string; nameAr: string; nameEn: string; discount: number }>;
  vatBreakdown?: Array<{ rateBp: number; net: number; vat: number }>;
}

/** What is printed on the invoice: kept with the document so it never changes afterwards. */
export interface InvoiceSnapshot {
  orderNumber: string;
  seller: InvoiceParty & { nameAr: string; nameEn: string };
  lines: Array<InvoiceLineDoc & { nameEn: string; gross: number }>;
  vatBreakdown: Array<{ rateBp: number; net: number; vat: number }>;
  paymentMeansCode: InvoiceDocument['paymentMeansCode'];
  originalNumber?: string;
}

type OrderWithItems = Order & { items: OrderItem[] };

const PAYMENT_MEANS: Record<Order['paymentMethod'], InvoiceDocument['paymentMeansCode']> = { CARD: '48', COD: '10', TABBY: '1', TAMARA: '1' };

/** Strip the parts excluded from the invoice hash from a stored signed document. */
export function hashInputFromSignedXml(xml: string): string {
  return xml
    .replace(/^<\?xml[^>]*\?>\n?/, '')
    .replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/, '')
    .replace(/<cac:AdditionalDocumentReference><cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/, '')
    .replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/, '');
}

const sarText = (halalas: number) => (halalas / 100).toFixed(2);
const sha256Base64 = (s: string) => createHash('sha256').update(s, 'utf8').digest('base64');

/**
 * ZATCA Phase 2 simplified tax invoices and credit notes. Every document is hashed, chained to the
 * previous one (PIH), numbered with a gap-free counter (ICV), signed with the unit's key, given a
 * TLV QR code and stored immutably; reporting to ZATCA runs as a retried background job.
 */
@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly keys: ZatcaKeys,
    private readonly zatca: ZatcaClient,
    @InjectQueue(QUEUES.invoicing) private readonly queue: Queue,
  ) {}

  /** Issue the tax invoice for a paid order (idempotent). */
  async issueForOrder(orderId: string): Promise<TaxInvoice> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    if (!order) throw AppError.notFound({ entity: 'order' });
    const existing = await this.prisma.taxInvoice.findFirst({ where: { orderId, kind: 'INVOICE' } });
    if (existing) return existing;
    const seller = await this.seller();
    const lines = this.linesFor(order);
    const invoice = await this.issue(order, { kind: 'INVOICE', seller, lines });
    await this.enqueueReport(invoice.id);
    return invoice;
  }

  /** Full credit note for an invoiced order that was cancelled or refunded in full. */
  async issueCreditNote(orderId: string, reason: string): Promise<TaxInvoice | null> {
    const original = await this.prisma.taxInvoice.findFirst({ where: { orderId, kind: 'INVOICE' } });
    if (!original) return null;
    const existing = await this.prisma.taxInvoice.findFirst({ where: { originalId: original.id } });
    if (existing) return existing;
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    const snap = original.snapshot as unknown as InvoiceSnapshot;
    const note = await this.issue(order, { kind: 'CREDIT_NOTE', seller: snap.seller, lines: snap.lines, original, reason });
    await this.enqueueReport(note.id);
    return note;
  }

  private async issue(
    order: OrderWithItems,
    input: { kind: 'INVOICE' | 'CREDIT_NOTE'; seller: InvoiceSnapshot['seller']; lines: InvoiceSnapshot['lines']; original?: TaxInvoice; reason?: string },
  ): Promise<TaxInvoice> {
    const totals = {
      net: input.lines.reduce((s, l) => s + l.net, 0),
      vat: input.lines.reduce((s, l) => s + l.vat, 0),
      gross: 0,
    };
    totals.gross = totals.net + totals.vat;
    const vatBreakdown = [...input.lines.reduce((m, l) => m.set(l.vatRateBp, { rateBp: l.vatRateBp, net: (m.get(l.vatRateBp)?.net ?? 0) + l.net, vat: (m.get(l.vatRateBp)?.vat ?? 0) + l.vat }), new Map<number, { rateBp: number; net: number; vat: number }>()).values()];

    return this.prisma.$transaction(async (tx) => {
      // One document at a time per unit: the chain head is locked until this one is stored.
      await tx.$executeRaw`INSERT INTO invoice_chain (id, last_icv, last_hash) VALUES (${CHAIN_ID}, 0, ${INITIAL_PREVIOUS_HASH}) ON CONFLICT (id) DO NOTHING`;
      const [head] = await tx.$queryRaw<Array<{ last_icv: number; last_hash: string }>>`SELECT last_icv, last_hash FROM invoice_chain WHERE id = ${CHAIN_ID} FOR UPDATE`;
      if (input.kind === 'INVOICE') {
        const dup = await tx.taxInvoice.findFirst({ where: { orderId: order.id, kind: 'INVOICE' } });
        if (dup) return dup;
      } else if (input.original) {
        const dup = await tx.taxInvoice.findFirst({ where: { originalId: input.original.id } });
        if (dup) return dup;
      }

      const issuedAt = new Date();
      const year = riyadhYear(issuedAt);
      const prefix = input.kind === 'INVOICE' ? 'INV' : 'CN';
      const number = sequenceNumber(prefix, year, await nextCounter(tx, `${prefix.toLowerCase()}:${year}`));
      const icv = head!.last_icv + 1;
      const doc: InvoiceDocument = {
        kind: input.kind,
        number,
        uuid: randomUUID(),
        icv,
        previousHash: head!.last_hash,
        issuedAt,
        seller: input.seller,
        paymentMeansCode: PAYMENT_MEANS[order.paymentMethod],
        billingReference: input.original?.number,
        creditReason: input.reason,
        lines: input.lines.map(({ nameEn: _en, gross: _g, ...l }) => l),
        totals,
      };
      assertInvoiceBalances(doc);

      const hash = sha256Base64(invoiceHashInput(doc));
      const signature = this.keys.signHash(hash);
      const signingTime = zatcaTimestamp(issuedAt);
      const cert = this.keys.certificate;
      const signedPropertiesDigest = cert ? ZatcaKeys.hexDigestBase64(signedPropertiesXml(signingTime, cert)) : undefined;
      const qr = zatcaQr({
        sellerName: input.seller.registrationName,
        vatNumber: input.seller.vatNumber!,
        timestamp: signingTime,
        total: sarText(totals.gross),
        vatTotal: sarText(totals.vat),
        invoiceHash: hash,
        signature,
        publicKey: this.keys.publicKeyDer,
        certificateSignature: this.keys.certificateSignature,
      });
      const xml = withXmlDeclaration(
        buildInvoiceXml(doc, { ublExtensions: signatureExtensionXml({ invoiceHash: hash, signatureValue: signature, signingTime, certificate: cert, signedPropertiesDigest }), qr, includeSignatureRef: true }),
      );

      const snapshot: InvoiceSnapshot = {
        orderNumber: order.number,
        seller: input.seller,
        lines: input.lines,
        vatBreakdown,
        paymentMeansCode: doc.paymentMeansCode,
        originalNumber: input.original?.number,
      };
      const saved = await tx.taxInvoice.create({
        data: {
          orderId: order.id,
          kind: input.kind,
          number,
          uuid: doc.uuid,
          icv,
          previousHash: doc.previousHash,
          hash,
          signature,
          xml,
          qr,
          issuedAt,
          net: totals.net,
          vat: totals.vat,
          total: totals.gross,
          originalId: input.original?.id,
          reason: input.reason,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          zatcaStatus: this.zatca.enabled ? 'PENDING' : 'NOT_SUBMITTED',
        },
      });
      await tx.$executeRaw`UPDATE invoice_chain SET last_icv = ${icv}, last_hash = ${hash} WHERE id = ${CHAIN_ID}`;
      return saved;
    });
  }

  private async enqueueReport(invoiceId: string) {
    if (!this.zatca.enabled) return;
    try {
      await this.queue.add('report', { invoiceId }, { jobId: `report:${invoiceId}`, attempts: 12, backoff: { type: 'exponential', delay: 30_000 } });
    } catch (err) {
      this.logger.error({ err, invoiceId }, 'Could not enqueue ZATCA reporting');
    }
  }

  /** Background job: report one document to ZATCA. */
  async report(invoiceId: string): Promise<void> {
    const inv = await this.prisma.taxInvoice.findUnique({ where: { id: invoiceId } });
    if (!inv || inv.zatcaStatus === 'REPORTED' || inv.zatcaStatus === 'REPORTED_WITH_WARNINGS') return;
    await this.prisma.taxInvoice.update({ where: { id: invoiceId }, data: { zatcaAttempts: { increment: 1 } } });
    const result = await this.zatca.report({ xml: inv.xml, hash: inv.hash, uuid: inv.uuid });
    await this.prisma.taxInvoice.update({
      where: { id: invoiceId },
      data: { zatcaStatus: result.status, zatcaResponse: result.body as Prisma.InputJsonValue, reportedAt: result.status === 'REJECTED' ? null : new Date() },
    });
    if (result.status === 'REJECTED') this.logger.error({ invoiceId, body: result.body }, 'ZATCA rejected an invoice');
  }

  async markReportFailed(invoiceId: string, message: string) {
    await this.prisma.taxInvoice.update({ where: { id: invoiceId }, data: { zatcaStatus: 'FAILED', zatcaResponse: { error: message } } });
  }

  /** Re-verify the whole chain: counters, previous-hash links, document hashes and signatures. */
  async verifyChain() {
    const errors: Array<{ number: string; problem: string }> = [];
    let previous = INITIAL_PREVIOUS_HASH;
    let expectedIcv = 1;
    let count = 0;
    let cursor: number | undefined;
    for (;;) {
      const batch = await this.prisma.taxInvoice.findMany({ where: cursor ? { icv: { gt: cursor } } : {}, orderBy: { icv: 'asc' }, take: 200, select: { number: true, icv: true, previousHash: true, hash: true, signature: true, xml: true } });
      if (batch.length === 0) break;
      for (const inv of batch) {
        if (inv.icv !== expectedIcv) errors.push({ number: inv.number, problem: `counter gap: expected ${expectedIcv}, found ${inv.icv}` });
        if (inv.previousHash !== previous) errors.push({ number: inv.number, problem: 'previous hash does not match' });
        if (sha256Base64(hashInputFromSignedXml(inv.xml)) !== inv.hash) errors.push({ number: inv.number, problem: 'document hash does not match' });
        if (!this.keys.verifyHash(inv.hash, inv.signature)) errors.push({ number: inv.number, problem: 'signature does not verify' });
        previous = inv.hash;
        expectedIcv = inv.icv + 1;
        count++;
      }
      cursor = batch.at(-1)!.icv;
    }
    return { ok: errors.length === 0, count, errors };
  }

  // ───── Reads ─────

  /** Printable bilingual view of a stored document. */
  present(inv: TaxInvoice) {
    const snap = inv.snapshot as unknown as InvoiceSnapshot;
    return {
      id: inv.id,
      kind: inv.kind,
      number: inv.number,
      uuid: inv.uuid,
      icv: inv.icv,
      orderNumber: snap.orderNumber,
      originalNumber: snap.originalNumber ?? null,
      reason: inv.reason,
      issuedAt: inv.issuedAt,
      seller: snap.seller,
      lines: snap.lines.map((l) => ({ id: l.id, nameAr: l.name, nameEn: l.nameEn, quantity: l.quantity, priceNet: l.priceNet, discountNet: l.discountNet, net: l.net, vat: l.vat, vatRateBp: l.vatRateBp, gross: l.net + l.vat })),
      vatBreakdown: snap.vatBreakdown,
      totals: { net: inv.net, vat: inv.vat, total: inv.total },
      qr: inv.qr,
      zatcaStatus: inv.zatcaStatus,
    };
  }

  forOrder(orderId: string) {
    return this.prisma.taxInvoice.findMany({ where: { orderId }, orderBy: { icv: 'asc' } });
  }

  async list(q: { page: number; limit: number; kind?: 'INVOICE' | 'CREDIT_NOTE'; zatcaStatus?: TaxInvoice['zatcaStatus'] }) {
    const where: Prisma.TaxInvoiceWhereInput = { kind: q.kind, zatcaStatus: q.zatcaStatus };
    const [items, total] = await Promise.all([
      this.prisma.taxInvoice.findMany({ where, orderBy: { icv: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit, select: { id: true, kind: true, number: true, icv: true, issuedAt: true, total: true, vat: true, zatcaStatus: true, orderId: true, order: { select: { number: true } } } }),
      this.prisma.taxInvoice.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }

  async get(id: string) {
    const inv = await this.prisma.taxInvoice.findUnique({ where: { id } });
    if (!inv) throw AppError.notFound({ entity: 'invoice' });
    return inv;
  }

  // ───── Builders ─────

  private async seller(): Promise<InvoiceSnapshot['seller']> {
    const [legal, name] = await Promise.all([this.settings.get('store.legal'), this.settings.get('store.name')]);
    if (!isValidVatNumber(legal.vatNumber)) throw new Error('store.legal.vatNumber is not a valid Saudi VAT number; tax invoices cannot be issued');
    return {
      registrationName: legal.legalNameAr || name.ar,
      nameAr: legal.legalNameAr || name.ar,
      nameEn: legal.legalNameEn || name.en,
      vatNumber: legal.vatNumber,
      crn: legal.commercialRegistration || undefined,
      street: legal.street || undefined,
      buildingNumber: legal.buildingNumber || undefined,
      district: legal.district || undefined,
      city: legal.city || undefined,
      postalCode: legal.postalCode || undefined,
    };
  }

  private linesFor(order: OrderWithItems): InvoiceSnapshot['lines'] {
    const pricing = order.pricing as OrderPricingSnapshot;
    const lines: InvoiceSnapshot['lines'] = [];
    let id = 1;
    for (const item of order.items) {
      const gross = item.unitPrice * item.quantity + item.giftWrapTotal;
      const amounts = invoiceLineAmounts({ gross, discount: item.discount, net: item.net, vat: item.vat, rateBp: item.vatRateBp, pricesIncludeVat: order.pricesIncludeVat });
      const wrapAr = item.giftWrap ? ' (مع تغليف هدية)' : '';
      const wrapEn = item.giftWrap ? ' (gift wrapped)' : '';
      const sampleAr = item.isSample ? 'عينة قماش: ' : '';
      const sampleEn = item.isSample ? 'Fabric sample: ' : '';
      lines.push({ id: id++, name: `${sampleAr}${item.nameAr}${wrapAr}`, nameEn: `${sampleEn}${item.nameEn ?? item.nameAr}${wrapEn}`, quantity: item.quantity, ...amounts, vatRateBp: item.vatRateBp, gross: item.total });
    }
    const service = (nameAr: string, nameEn: string, part?: { net: number; vat: number; gross: number }) => {
      if (!part || part.gross === 0) return;
      lines.push({ id: id++, name: nameAr, nameEn, quantity: 1, priceNet: part.net, discountNet: 0, net: part.net, vat: part.vat, vatRateBp: order.vatRateBp, gross: part.gross });
    };
    service('رسوم التوصيل', 'Delivery', pricing.shipping);
    service('رسوم الدفع عند الاستلام', 'Cash on delivery fee', pricing.codFee);
    const net = lines.reduce((s, l) => s + l.net, 0);
    const vat = lines.reduce((s, l) => s + l.vat, 0);
    if (net !== order.net || vat !== order.vat) throw new Error(`Order ${order.number} totals do not match its lines (net ${net}/${order.net}, vat ${vat}/${order.vat})`);
    return lines;
  }
}

/**
 * UBL 2.1 XML for ZATCA simplified tax invoices (InvoiceTypeCode 388, name "0200000") and credit
 * notes (381). ZATCA issues both on the UBL Invoice schema; a credit note adds a BillingReference
 * to the original invoice and the reason in PaymentMeans/InstructionNote.
 *
 * The serializer is deterministic and already in canonical (C14N 1.1) form: no XML declaration in
 * the hash input, no insignificant whitespace, explicit end tags, sorted attributes and escaped
 * text, so the invoice hash is reproducible. The hash input excludes UBLExtensions, the QR
 * reference and cac:Signature, as the ZATCA specification requires.
 */
import { roundHalfUp, type Halalas } from '../money/money';

export const INITIAL_PREVIOUS_HASH = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

export interface InvoiceParty {
  registrationName: string;
  vatNumber?: string;
  /** Commercial registration number (CRN). */
  crn?: string;
  street?: string;
  buildingNumber?: string;
  district?: string;
  city?: string;
  postalCode?: string;
}

export interface InvoiceLineDoc {
  id: number;
  name: string;
  quantity: number;
  /**
   * Net price of the whole line before discount (halalas), expressed per BaseQuantity = quantity.
   * Prices are VAT-inclusive, so a per-unit net price is not always a whole halala; pricing the
   * full quantity keeps LineExtensionAmount = quantity × price / baseQuantity − allowance exact.
   */
  priceNet: Halalas;
  /** Net line discount (halalas). */
  discountNet: Halalas;
  /** Net line amount after discount. */
  net: Halalas;
  vat: Halalas;
  vatRateBp: number;
}

export interface InvoiceDocument {
  kind: 'INVOICE' | 'CREDIT_NOTE';
  number: string;
  uuid: string;
  icv: number;
  previousHash: string;
  issuedAt: Date;
  seller: InvoiceParty;
  buyer?: InvoiceParty;
  /** 10 cash, 48 card, 30 credit transfer, 1 other (e.g. BNPL). */
  paymentMeansCode: '10' | '30' | '48' | '1';
  /** Credit notes reference the original invoice and state the reason. */
  billingReference?: string;
  creditReason?: string;
  lines: InvoiceLineDoc[];
  totals: { net: Halalas; vat: Halalas; gross: Halalas };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r/g, '&#xD;');
const sar = (halalas: Halalas) => (halalas / 100).toFixed(2);
const pct = (bp: number) => (bp / 100).toFixed(2);

function el(name: string, content: string, attrs: Record<string, string> = {}): string {
  const a = Object.keys(attrs)
    .sort()
    .map((k) => ` ${k}="${esc(attrs[k]!)}"`)
    .join('');
  return `<${name}${a}>${content}</${name}>`;
}

const t = (name: string, value: string | number, attrs?: Record<string, string>) => el(name, esc(String(value)), attrs);
const money = (name: string, halalas: Halalas) => t(name, sar(halalas), { currencyID: 'SAR' });

function riyadhDateTime(d: Date): { date: string; time: string } {
  // Saudi Arabia is UTC+3 all year (no daylight saving).
  const local = new Date(d.getTime() + 3 * 3_600_000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 19) };
}

function party(tag: 'cac:AccountingSupplierParty' | 'cac:AccountingCustomerParty', p: InvoiceParty): string {
  const address = [
    p.street ? t('cbc:StreetName', p.street) : '',
    p.buildingNumber ? t('cbc:BuildingNumber', p.buildingNumber) : '',
    p.district ? t('cbc:CitySubdivisionName', p.district) : '',
    p.city ? t('cbc:CityName', p.city) : '',
    p.postalCode ? t('cbc:PostalZone', p.postalCode) : '',
    el('cac:Country', t('cbc:IdentificationCode', 'SA')),
  ].join('');
  return el(
    tag,
    el(
      'cac:Party',
      (p.crn ? el('cac:PartyIdentification', t('cbc:ID', p.crn, { schemeID: 'CRN' })) : '') +
        el('cac:PostalAddress', address) +
        (p.vatNumber ? el('cac:PartyTaxScheme', t('cbc:CompanyID', p.vatNumber) + el('cac:TaxScheme', t('cbc:ID', 'VAT'))) : '') +
        el('cac:PartyLegalEntity', t('cbc:RegistrationName', p.registrationName)),
    ),
  );
}

function taxCategory(tag: string, rateBp: number): string {
  const code = rateBp > 0 ? 'S' : 'Z';
  return el(tag, t('cbc:ID', code) + t('cbc:Percent', pct(rateBp)) + el('cac:TaxScheme', t('cbc:ID', 'VAT')));
}

function lineXml(l: InvoiceLineDoc): string {
  const allowance =
    l.discountNet > 0
      ? el('cac:AllowanceCharge', t('cbc:ChargeIndicator', 'false') + t('cbc:AllowanceChargeReason', 'discount') + money('cbc:Amount', l.discountNet))
      : '';
  return el(
    'cac:InvoiceLine',
    t('cbc:ID', l.id) +
      t('cbc:InvoicedQuantity', l.quantity, { unitCode: 'PCE' }) +
      money('cbc:LineExtensionAmount', l.net) +
      el('cac:TaxTotal', money('cbc:TaxAmount', l.vat) + money('cbc:RoundingAmount', l.net + l.vat)) +
      el('cac:Item', t('cbc:Name', l.name) + taxCategory('cac:ClassifiedTaxCategory', l.vatRateBp)) +
      el('cac:Price', money('cbc:PriceAmount', l.priceNet) + t('cbc:BaseQuantity', l.quantity, { unitCode: 'PCE' }) + allowance),
  );
}

export interface UblParts {
  /** ds:Signature extension (signed XML); empty for the hash input. */
  ublExtensions?: string;
  /** Base64 TLV QR. */
  qr?: string;
  /** cac:Signature block referencing the extension. */
  includeSignatureRef?: boolean;
}

/** Full XML document, or the canonical hash input when no parts are given. */
export function buildInvoiceXml(doc: InvoiceDocument, parts: UblParts = {}): string {
  const credit = doc.kind === 'CREDIT_NOTE';
  const { date, time } = riyadhDateTime(doc.issuedAt);
  const byRate = new Map<number, { net: number; vat: number }>();
  for (const l of doc.lines) {
    const b = byRate.get(l.vatRateBp) ?? { net: 0, vat: 0 };
    b.net += l.net;
    b.vat += l.vat;
    byRate.set(l.vatRateBp, b);
  }
  const lineNetTotal = doc.lines.reduce((s, l) => s + l.net, 0);

  const body =
    (parts.ublExtensions ? el('ext:UBLExtensions', parts.ublExtensions) : '') +
    t('cbc:ProfileID', 'reporting:1.0') +
    t('cbc:ID', doc.number) +
    t('cbc:UUID', doc.uuid) +
    t('cbc:IssueDate', date) +
    t('cbc:IssueTime', time) +
    t('cbc:InvoiceTypeCode', credit ? '381' : '388', { name: '0200000' }) +
    t('cbc:DocumentCurrencyCode', 'SAR') +
    t('cbc:TaxCurrencyCode', 'SAR') +
    (doc.billingReference ? el('cac:BillingReference', el('cac:InvoiceDocumentReference', t('cbc:ID', doc.billingReference))) : '') +
    el('cac:AdditionalDocumentReference', t('cbc:ID', 'ICV') + t('cbc:UUID', doc.icv)) +
    el('cac:AdditionalDocumentReference', t('cbc:ID', 'PIH') + el('cac:Attachment', t('cbc:EmbeddedDocumentBinaryObject', doc.previousHash, { mimeCode: 'text/plain' }))) +
    (parts.qr ? el('cac:AdditionalDocumentReference', t('cbc:ID', 'QR') + el('cac:Attachment', t('cbc:EmbeddedDocumentBinaryObject', parts.qr, { mimeCode: 'text/plain' }))) : '') +
    (parts.includeSignatureRef
      ? el('cac:Signature', t('cbc:ID', 'urn:oasis:names:specification:ubl:signature:Invoice') + t('cbc:SignatureMethod', 'urn:oasis:names:specification:ubl:dsig:enveloped:xades'))
      : '') +
    party('cac:AccountingSupplierParty', doc.seller) +
    (doc.buyer ? party('cac:AccountingCustomerParty', doc.buyer) : '') +
    el('cac:PaymentMeans', t('cbc:PaymentMeansCode', doc.paymentMeansCode) + (doc.creditReason ? t('cbc:InstructionNote', doc.creditReason) : '')) +
    el('cac:TaxTotal', money('cbc:TaxAmount', doc.totals.vat)) +
    el(
      'cac:TaxTotal',
      money('cbc:TaxAmount', doc.totals.vat) +
        [...byRate.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([rate, v]) => el('cac:TaxSubtotal', money('cbc:TaxableAmount', v.net) + money('cbc:TaxAmount', v.vat) + taxCategory('cac:TaxCategory', rate)))
          .join(''),
    ) +
    el(
      'cac:LegalMonetaryTotal',
      money('cbc:LineExtensionAmount', lineNetTotal) +
        money('cbc:TaxExclusiveAmount', doc.totals.net) +
        money('cbc:TaxInclusiveAmount', doc.totals.gross) +
        money('cbc:AllowanceTotalAmount', 0) +
        money('cbc:PrepaidAmount', 0) +
        money('cbc:PayableAmount', doc.totals.gross),
    ) +
    doc.lines.map(lineXml).join('');

  const ns = {
    xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  };
  return el('Invoice', body, ns);
}

/** Canonical bytes that are hashed (SHA-256) and signed. */
export function invoiceHashInput(doc: InvoiceDocument): string {
  return buildInvoiceXml(doc);
}

export function withXmlDeclaration(xml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

/** Riyadh-local timestamp for QR tag 3. */
export function zatcaTimestamp(d: Date): string {
  const { date, time } = riyadhDateTime(d);
  return `${date}T${time}`;
}

/**
 * Invoice line amounts from an order line. `net` and `vat` are taken as stored on the order (the
 * customer paid exactly that); the pre-discount net price is derived in the same basis, and the
 * discount is whatever separates the two, so every line balances to the halala.
 */
export function invoiceLineAmounts(input: { gross: Halalas; discount: Halalas; net: Halalas; vat: Halalas; rateBp: number; pricesIncludeVat: boolean }) {
  const { gross, discount, net, vat, rateBp, pricesIncludeVat } = input;
  if (discount === 0) return { priceNet: net, discountNet: 0, net, vat };
  const priceNet = pricesIncludeVat ? roundHalfUp((gross * 10_000) / (10_000 + rateBp)) : gross;
  return { priceNet, discountNet: priceNet - net, net, vat };
}

/** Totals must reconcile exactly before an invoice can be issued. */
export function assertInvoiceBalances(doc: InvoiceDocument): void {
  const net = doc.lines.reduce((s, l) => s + l.net, 0);
  const vat = doc.lines.reduce((s, l) => s + l.vat, 0);
  if (net !== doc.totals.net || vat !== doc.totals.vat || net + vat !== doc.totals.gross) {
    throw new Error(`Invoice ${doc.number} does not balance (net ${net}/${doc.totals.net}, vat ${vat}/${doc.totals.vat})`);
  }
  for (const l of doc.lines) {
    if (l.priceNet - l.discountNet !== l.net) throw new Error(`Invoice ${doc.number} line ${l.id} does not balance`);
  }
}

import { describe, expect, it } from 'vitest';
import { decodeTlv, encodeTlv, fromBase64, isValidVatNumber, TlvError, tlvText, toBase64, zatcaQr } from './tlv';
import { assertInvoiceBalances, buildInvoiceXml, INITIAL_PREVIOUS_HASH, invoiceHashInput, invoiceLineAmounts, withXmlDeclaration, zatcaTimestamp, type InvoiceDocument } from './ubl';
import { signatureExtensionXml, signedPropertiesXml } from './xades';

describe('TLV', () => {
  it('round-trips text and bytes, including Arabic', () => {
    const encoded = encodeTlv([
      { tag: 1, value: 'هدهد للمفروشات' },
      { tag: 8, value: Uint8Array.from([0, 255, 7]) },
    ]);
    const decoded = decodeTlv(encoded);
    expect(decoded.map((f) => f.tag)).toEqual([1, 8]);
    expect(tlvText(decoded[0]!.value)).toBe('هدهد للمفروشات');
    expect([...decoded[1]!.value]).toEqual([0, 255, 7]);
    // Length is in UTF-8 bytes, not characters.
    expect(encoded[1]).toBe(new TextEncoder().encode('هدهد للمفروشات').length);
  });

  it('rejects invalid tags, oversized values and truncated input', () => {
    expect(() => encodeTlv([{ tag: 0, value: 'x' }])).toThrow(TlvError);
    expect(() => encodeTlv([{ tag: 256, value: 'x' }])).toThrow(TlvError);
    expect(() => encodeTlv([{ tag: 1, value: 'x'.repeat(256) }])).toThrow(/max 255/);
    expect(() => decodeTlv(Uint8Array.from([1]))).toThrow(/header/);
    expect(() => decodeTlv(Uint8Array.from([1, 5, 65]))).toThrow(/Truncated value/);
  });

  it('base64 round-trips binary data', () => {
    const bytes = Uint8Array.from([0, 1, 127, 128, 254, 255]);
    expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes]);
  });

  it('matches the ZATCA reference Phase 1 QR for the published sample', () => {
    // Known vector: "Bobs Records" / 310122393500003 / 2022-04-25T15:30:00Z / 1000.00 / 150.00
    const qr = zatcaQr({ sellerName: 'Bobs Records', vatNumber: '310122393500003', timestamp: '2022-04-25T15:30:00Z', total: '1000.00', vatTotal: '150.00' });
    expect(qr).toBe('AQxCb2JzIFJlY29yZHMCDzMxMDEyMjM5MzUwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoEBzEwMDAuMDAFBjE1MC4wMA==');
  });

  it('adds signature tags 6–9 when present', () => {
    const qr = zatcaQr({
      sellerName: 'S',
      vatNumber: '300000000000003',
      timestamp: '2026-10-16T10:00:00',
      total: '115.00',
      vatTotal: '15.00',
      invoiceHash: 'aGFzaA==',
      signature: 'c2ln',
      publicKey: Uint8Array.from([1, 2]),
      certificateSignature: Uint8Array.from([3]),
    });
    expect(decodeTlv(fromBase64(qr)).map((f) => f.tag)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('validates Saudi VAT numbers', () => {
    expect(isValidVatNumber('300000000000003')).toBe(true);
    expect(isValidVatNumber('310122393500003')).toBe(true);
    expect(isValidVatNumber('200000000000003')).toBe(false);
    expect(isValidVatNumber('30000000000003')).toBe(false);
  });
});

const doc = (over: Partial<InvoiceDocument> = {}): InvoiceDocument => ({
  kind: 'INVOICE',
  number: 'INV-2026-000001',
  uuid: '6f4d20e0-6bfe-4a80-9389-7dabe6620f12',
  icv: 1,
  previousHash: INITIAL_PREVIOUS_HASH,
  issuedAt: new Date('2026-10-15T21:30:00Z'),
  seller: {
    registrationName: 'مؤسسة هدهد & شركاه <test>',
    vatNumber: '300000000000003',
    crn: '1010000000',
    street: 'King Fahd Rd',
    buildingNumber: '1234',
    district: 'Al Olaya',
    city: 'Riyadh',
    postalCode: '12211',
  },
  paymentMeansCode: '48',
  lines: [
    { id: 1, name: 'ستارة "بلاك أوت"', quantity: 2, priceNet: 20000, discountNet: 1000, net: 19000, vat: 2850, vatRateBp: 1500 },
    { id: 2, name: 'Shipping', quantity: 1, priceNet: 2000, discountNet: 0, net: 2000, vat: 300, vatRateBp: 1500 },
    { id: 3, name: 'Sample', quantity: 1, priceNet: 500, discountNet: 0, net: 500, vat: 0, vatRateBp: 0 },
  ],
  totals: { net: 21500, vat: 3150, gross: 24650 },
  ...over,
});

describe('UBL invoice XML', () => {
  it('builds a simplified tax invoice with Riyadh-local date and time', () => {
    const xml = buildInvoiceXml(doc());
    expect(xml.startsWith('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"')).toBe(true);
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:IssueDate>2026-10-16</cbc:IssueDate><cbc:IssueTime>00:30:00</cbc:IssueTime>');
    expect(xml).toContain('<cbc:ID>ICV</cbc:ID><cbc:UUID>1</cbc:UUID>');
    expect(xml).toContain(INITIAL_PREVIOUS_HASH);
    expect(xml).toContain('<cbc:PayableAmount currencyID="SAR">246.50</cbc:PayableAmount>');
    expect(xml).toContain('<cbc:Amount currencyID="SAR">10.00</cbc:Amount>');
    expect(xml).toContain('<cbc:PriceAmount currencyID="SAR">200.00</cbc:PriceAmount><cbc:BaseQuantity unitCode="PCE">2</cbc:BaseQuantity>');
    expect(xml).toContain('<cbc:ID schemeID="CRN">1010000000</cbc:ID>');
    expect(xml).not.toContain('AccountingCustomerParty');
  });

  it('escapes text and groups VAT by rate (standard first)', () => {
    const xml = buildInvoiceXml(doc());
    expect(xml).toContain('مؤسسة هدهد &amp; شركاه &lt;test&gt;');
    expect(xml).toContain('ستارة &quot;بلاك أوت&quot;');
    const standard = xml.indexOf('<cbc:TaxableAmount currencyID="SAR">210.00</cbc:TaxableAmount>');
    const zero = xml.indexOf('<cbc:TaxableAmount currencyID="SAR">5.00</cbc:TaxableAmount>');
    expect(standard).toBeGreaterThan(0);
    expect(zero).toBeGreaterThan(standard);
    expect(xml).toContain('<cbc:ID>Z</cbc:ID><cbc:Percent>0.00</cbc:Percent>');
  });

  it('keeps extensions, QR and signature out of the hash input but in the full document', () => {
    const d = doc();
    const hashInput = invoiceHashInput(d);
    const full = buildInvoiceXml(d, { ublExtensions: '<ext:UBLExtension>sig</ext:UBLExtension>', qr: 'QRDATA', includeSignatureRef: true });
    expect(hashInput).not.toMatch(/UBLExtensions|QRDATA|cac:Signature/);
    expect(full).toContain('<ext:UBLExtensions><ext:UBLExtension>sig</ext:UBLExtension></ext:UBLExtensions>');
    expect(full).toContain('QRDATA');
    expect(full).toContain('<cac:Signature>');
    expect(invoiceHashInput(d)).toBe(hashInput);
    expect(withXmlDeclaration(full).startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<Invoice')).toBe(true);
  });

  it('builds credit notes that reference the original invoice and include a buyer', () => {
    const xml = buildInvoiceXml(
      doc({ kind: 'CREDIT_NOTE', number: 'CN-2026-000001', billingReference: 'INV-2026-000001', creditReason: 'Returned item', buyer: { registrationName: 'Sara' } }),
    );
    expect(xml.startsWith('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"')).toBe(true);
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">381</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cac:InvoiceDocumentReference><cbc:ID>INV-2026-000001</cbc:ID></cac:InvoiceDocumentReference>');
    expect(xml).toContain('<cbc:InstructionNote>Returned item</cbc:InstructionNote>');
    expect(xml).toContain('<cac:InvoiceLine>');
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="PCE">2</cbc:InvoicedQuantity>');
    expect(xml).toContain('<cac:AccountingCustomerParty><cac:Party><cac:PostalAddress><cac:Country>');
  });

  it('formats the QR timestamp in Riyadh time', () => {
    expect(zatcaTimestamp(new Date('2026-10-15T21:30:00Z'))).toBe('2026-10-16T00:30:00');
  });

  it('checks that totals and lines reconcile', () => {
    expect(() => assertInvoiceBalances(doc())).not.toThrow();
    expect(() => assertInvoiceBalances(doc({ totals: { net: 21500, vat: 3151, gross: 24651 } }))).toThrow(/does not balance/);
    expect(() => assertInvoiceBalances(doc({ totals: { net: 21500, vat: 3150, gross: 24600 } }))).toThrow(/does not balance/);
    const bad = doc();
    bad.lines[0] = { ...bad.lines[0]!, discountNet: 999 };
    expect(() => assertInvoiceBalances(bad)).toThrow(/line 1/);
  });
});

describe('invoiceLineAmounts', () => {
  it('keeps undiscounted lines as stored', () => {
    expect(invoiceLineAmounts({ gross: 11500, discount: 0, net: 10000, vat: 1500, rateBp: 1500, pricesIncludeVat: true })).toEqual({ priceNet: 10000, discountNet: 0, net: 10000, vat: 1500 });
  });

  it('derives the net discount from VAT-inclusive prices so the line balances', () => {
    // 2 × 99.99 SAR with 20 SAR off: net of 179.98 is 156.50.
    const r = invoiceLineAmounts({ gross: 19998, discount: 2000, net: 15650, vat: 2348, rateBp: 1500, pricesIncludeVat: true });
    expect(r.priceNet).toBe(17390);
    expect(r.priceNet - r.discountNet).toBe(15650);
  });

  it('uses prices as net when they exclude VAT', () => {
    expect(invoiceLineAmounts({ gross: 10000, discount: 1000, net: 9000, vat: 1350, rateBp: 1500, pricesIncludeVat: false })).toMatchObject({ priceNet: 10000, discountNet: 1000 });
  });
});

describe('XAdES signature extension', () => {
  const cert = { certificateBase64: 'MIIB', certificateDigest: 'ZGln', issuerName: 'CN=Test & Co', serialNumber: '123' };

  it('builds the signed properties with escaped issuer data', () => {
    const xml = signedPropertiesXml('2026-10-16T00:30:00', cert);
    expect(xml.startsWith('<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">')).toBe(true);
    expect(xml).toContain('<ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">CN=Test &amp; Co</ds:X509IssuerName>');
    expect(xml).toContain('<xades:SigningTime>2026-10-16T00:30:00</xades:SigningTime>');
  });

  it('includes the certificate, key info and both references when certified', () => {
    const xml = signatureExtensionXml({ invoiceHash: 'SEFTSA==', signatureValue: 'U0lH', signingTime: '2026-10-16T00:30:00', certificate: cert, signedPropertiesDigest: 'UFJPUA==' });
    expect(xml).toContain('<ds:DigestValue>SEFTSA==</ds:DigestValue>');
    expect(xml).toContain('URI="#xadesSignedProperties"');
    expect(xml).toContain('<ds:X509Certificate>MIIB</ds:X509Certificate>');
    expect(xml).toContain("not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID=&apos;QR&apos;])".replace(/&apos;/g, "'"));
    expect(xml).toContain('<ds:SignatureValue>U0lH</ds:SignatureValue>');
  });

  it('omits certificate parts for an uncertified key', () => {
    const xml = signatureExtensionXml({ invoiceHash: 'SEFTSA==', signatureValue: 'U0lH', signingTime: '2026-10-16T00:30:00' });
    expect(xml).not.toMatch(/KeyInfo|xadesSignedProperties|QualifyingProperties/);
  });
});

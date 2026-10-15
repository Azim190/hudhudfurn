/**
 * ZATCA QR code payload: Tag-Length-Value with 1-byte tags and lengths, Base64-encoded.
 * Phase 2 (integration) tags for simplified invoices:
 *   1 seller name · 2 VAT number · 3 timestamp · 4 total incl. VAT · 5 VAT total
 *   6 invoice hash · 7 ECDSA signature · 8 ECDSA public key · 9 CSID certificate signature
 */
export type TlvValue = string | Uint8Array;

export class TlvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TlvError';
  }
}

// Web-standard globals available in Node ≥18, browsers and Flutter web views. Declared locally
// (module scope) because the domain package compiles without DOM or Node type libraries.
declare const TextEncoder: { new (): { encode(input: string): Uint8Array } };
declare const TextDecoder: { new (): { decode(input: Uint8Array): string } };
declare function btoa(data: string): string;
declare function atob(data: string): string;

const utf8 = new TextEncoder();
const utf8Decoder = new TextDecoder();

export function encodeTlv(fields: ReadonlyArray<{ tag: number; value: TlvValue }>): Uint8Array {
  const parts: number[] = [];
  for (const { tag, value } of fields) {
    if (!Number.isInteger(tag) || tag < 1 || tag > 255) throw new TlvError(`Invalid tag ${tag}`);
    const bytes = typeof value === 'string' ? utf8.encode(value) : value;
    if (bytes.length > 255) throw new TlvError(`Tag ${tag} value is ${bytes.length} bytes (max 255)`);
    parts.push(tag, bytes.length, ...bytes);
  }
  return Uint8Array.from(parts);
}

export function decodeTlv(data: Uint8Array): Array<{ tag: number; value: Uint8Array }> {
  const out: Array<{ tag: number; value: Uint8Array }> = [];
  let i = 0;
  while (i < data.length) {
    if (i + 2 > data.length) throw new TlvError('Truncated TLV header');
    const tag = data[i]!;
    const length = data[i + 1]!;
    if (i + 2 + length > data.length) throw new TlvError(`Truncated value for tag ${tag}`);
    out.push({ tag, value: data.slice(i + 2, i + 2 + length) });
    i += 2 + length;
  }
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  return Uint8Array.from(binary, (c: string) => c.charCodeAt(0));
}

export const tlvText = (value: Uint8Array) => utf8Decoder.decode(value);

export interface ZatcaQrInput {
  sellerName: string;
  vatNumber: string;
  /** ISO-8601 local timestamp, e.g. 2026-10-16T14:05:00 */
  timestamp: string;
  total: string;
  vatTotal: string;
  invoiceHash?: string;
  signature?: string;
  publicKey?: Uint8Array;
  certificateSignature?: Uint8Array;
}

/** Base64 QR payload. Tags 6–9 are added when the invoice is signed (Phase 2). */
export function zatcaQr(input: ZatcaQrInput): string {
  const fields: Array<{ tag: number; value: TlvValue }> = [
    { tag: 1, value: input.sellerName },
    { tag: 2, value: input.vatNumber },
    { tag: 3, value: input.timestamp },
    { tag: 4, value: input.total },
    { tag: 5, value: input.vatTotal },
  ];
  if (input.invoiceHash) fields.push({ tag: 6, value: input.invoiceHash });
  if (input.signature) fields.push({ tag: 7, value: input.signature });
  if (input.publicKey) fields.push({ tag: 8, value: input.publicKey });
  if (input.certificateSignature) fields.push({ tag: 9, value: input.certificateSignature });
  return toBase64(encodeTlv(fields));
}

/** Saudi VAT registration numbers: 15 digits, starting and ending with 3. */
export function isValidVatNumber(vat: string): boolean {
  return /^3\d{13}3$/.test(vat);
}

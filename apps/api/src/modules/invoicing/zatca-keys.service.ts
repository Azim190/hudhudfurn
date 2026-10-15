import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, X509Certificate, type KeyObject } from 'node:crypto';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { SigningCertificateInfo } from '@hudhud/domain';
import { AppConfig } from '../../core/config/app-config.service';
import { CryptoService } from '../../core/crypto/crypto.service';
import { PrismaService } from '../../core/prisma/prisma.service';

const DEV_KEY_SETTING = 'zatca.devSigningKey';

/** Reads one DER TLV at `offset`; returns the value bounds and the next offset. */
function derTlv(buf: Buffer, offset: number): { tag: number; start: number; end: number } {
  const tag = buf[offset]!;
  let len = buf[offset + 1]!;
  let start = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[start + i]!;
    start += n;
  }
  return { tag, start, end: start + len };
}

/** Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue BIT STRING }. */
export function certificateSignature(der: Buffer): Buffer {
  const outer = derTlv(der, 0);
  const tbs = derTlv(der, outer.start);
  const alg = derTlv(der, tbs.end);
  const sig = derTlv(der, alg.end);
  if (sig.tag !== 0x03) throw new Error('Unexpected certificate structure');
  // Skip the "unused bits" byte of the BIT STRING.
  return der.subarray(sig.start + 1, sig.end);
}

/**
 * The e-invoicing unit's signing identity: a secp256k1 key and, once onboarded, the CSID
 * certificate issued by ZATCA. Without a certificate (local development) invoices are still
 * hashed, chained and signed with a generated key that is kept encrypted in the database.
 */
@Injectable()
export class ZatcaKeys implements OnModuleInit {
  private readonly logger = new Logger(ZatcaKeys.name);
  private privateKey!: KeyObject;
  private publicKey!: KeyObject;
  private cert?: SigningCertificateInfo & { signature: Buffer };

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async onModuleInit() {
    const configured = this.config.get('ZATCA_PRIVATE_KEY');
    const pem = configured ? Buffer.from(configured, 'base64').toString('utf8') : await this.devKeyPem();
    this.privateKey = createPrivateKey(pem);
    this.publicKey = createPublicKey(this.privateKey);
    const token = this.config.get('ZATCA_CSID_TOKEN');
    if (token) this.cert = this.loadCertificate(token);
  }

  private async devKeyPem(): Promise<string> {
    const row = await this.prisma.setting.findUnique({ where: { key: DEV_KEY_SETTING } });
    if (row) return this.crypto.decrypt((row.value as { pem: string }).pem);
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
    const pem = privateKey.export({ type: 'sec1', format: 'pem' }).toString();
    try {
      await this.prisma.setting.create({ data: { key: DEV_KEY_SETTING, value: { pem: this.crypto.encrypt(pem) } } });
      this.logger.warn('Generated a local ZATCA signing key (development only; configure ZATCA_PRIVATE_KEY for production)');
      return pem;
    } catch {
      // Another instance created it first.
      const existing = await this.prisma.setting.findUniqueOrThrow({ where: { key: DEV_KEY_SETTING } });
      return this.crypto.decrypt((existing.value as { pem: string }).pem);
    }
  }

  /** ZATCA's binarySecurityToken is base64 of the base64 certificate body. */
  private loadCertificate(token: string) {
    const certificateBase64 = Buffer.from(token, 'base64').toString('utf8').replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, '');
    const der = Buffer.from(certificateBase64, 'base64');
    const x509 = new X509Certificate(der);
    return {
      certificateBase64,
      certificateDigest: Buffer.from(createHash('sha256').update(certificateBase64).digest('hex')).toString('base64'),
      issuerName: x509.issuer.split('\n').reverse().join(', '),
      serialNumber: BigInt(`0x${x509.serialNumber}`).toString(10),
      signature: certificateSignature(der),
    };
  }

  get certificate(): SigningCertificateInfo | undefined {
    return this.cert;
  }

  get certificateSignature(): Buffer | undefined {
    return this.cert?.signature;
  }

  /** SubjectPublicKeyInfo DER, for QR tag 8. */
  get publicKeyDer(): Buffer {
    return this.publicKey.export({ type: 'spki', format: 'der' });
  }

  /** ECDSA-SHA256 over the invoice hash bytes, DER-encoded and base64 (ZATCA's signature value). */
  signHash(invoiceHashBase64: string): string {
    return sign('sha256', Buffer.from(invoiceHashBase64, 'base64'), this.privateKey).toString('base64');
  }

  verifyHash(invoiceHashBase64: string, signatureBase64: string): boolean {
    return verify('sha256', Buffer.from(invoiceHashBase64, 'base64'), this.publicKey, Buffer.from(signatureBase64, 'base64'));
  }

  static hexDigestBase64(value: string): string {
    return Buffer.from(createHash('sha256').update(value).digest('hex')).toString('base64');
  }
}

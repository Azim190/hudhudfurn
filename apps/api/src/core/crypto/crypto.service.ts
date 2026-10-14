import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    this.key = Buffer.from(config.get('ENCRYPTION_KEY'), 'base64');
  }

  /** AES-256-GCM. Output: `v1.<iv>.<tag>.<ciphertext>` (base64url parts). */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv, tag, ct].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ct] = payload.split('.');
    if (version !== VERSION || !iv || !tag || !ct) throw new Error('Unsupported ciphertext format');
    const decipher = createDecipheriv(ALGO, this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
  }

  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  hmac(secret: string, value: string): string {
    return createHmac('sha256', secret).update(value).digest('hex');
  }

  /** Constant-time comparison of two hex/ascii strings. */
  safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /** Uniformly random numeric code, zero-padded (e.g. OTPs). */
  numericCode(length: number): string {
    return randomInt(0, 10 ** length).toString().padStart(length, '0');
  }

  /** Human-friendly single-use code: XXXXX-XXXXX from an unambiguous alphabet. */
  recoveryCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const chars = Array.from({ length: 10 }, () => alphabet[randomInt(0, alphabet.length)]);
    return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
  }
}

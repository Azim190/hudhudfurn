/** Object storage port. Adapter: S3-compatible (AWS S3, SeaweedFS, Cloudflare R2, OCI...). */
export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  /** Immutable assets (content-addressed renditions) can be cached forever by the CDN. */
  immutable?: boolean;
}

export interface StoragePort {
  put(input: PutObjectInput): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(keys: string[]): Promise<void>;
  publicUrl(key: string): string;
}

export const STORAGE = Symbol('STORAGE');
/** Same port, private bucket (no public URLs). */
export const PRIVATE_STORAGE = Symbol('PRIVATE_STORAGE');

/**
 * Upload scanning hook (OWASP file-upload guidance). The default adapter accepts everything
 * after strict type validation; a ClamAV adapter can be plugged in without code changes elsewhere.
 */
export interface MalwareScanner {
  scan(body: Buffer, filename: string): Promise<{ clean: boolean; signature?: string }>;
}

export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');

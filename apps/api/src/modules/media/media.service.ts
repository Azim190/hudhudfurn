import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MediaAsset, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppConfig } from '../../core/config/app-config.service';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { QUEUES } from '../../core/queue/queue.module';
import { MALWARE_SCANNER, STORAGE, type MalwareScanner, type StoragePort } from '../storage/storage.port';

/** Formats accepted for upload. SVG is deliberately excluded (script injection risk). */
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif', 'tiff']);
export const RENDITION_WIDTHS = [320, 640, 960, 1440, 1920] as const;
const MAX_INPUT_PIXELS = 50_000_000;

export interface Rendition {
  format: 'webp' | 'avif';
  width: number;
  key: string;
}

export interface MediaDto {
  id: string;
  status: MediaAsset['status'];
  width: number | null;
  height: number | null;
  altAr: string | null;
  altEn: string | null;
  url: string;
  /** Smallest WebP rendition, for lists and thumbnails. */
  thumbnailUrl: string;
  renditions: Array<{ format: string; width: number; url: string }>;
}

export interface UploadedImage {
  buffer: Buffer;
  originalname: string;
  size: number;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
    @InjectQueue(QUEUES.media) private readonly queue: Queue,
  ) {}

  /**
   * Validate by content (not by the client-declared type), strip metadata (EXIF/GPS) by
   * re-encoding, store the normalized original and queue the responsive renditions.
   */
  async upload(file: UploadedImage, actorId: string | undefined, alt: { altAr?: string; altEn?: string } = {}): Promise<MediaDto> {
    const maxBytes = this.config.get('MAX_UPLOAD_MB') * 1024 * 1024;
    if (!file?.buffer?.length) throw AppError.badRequest('validation', { field: 'file' });
    if (file.size > maxBytes) throw AppError.badRequest('validation', { field: 'file', reason: 'tooLarge', maxBytes });

    let meta: sharp.Metadata;
    try {
      meta = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    } catch {
      throw AppError.badRequest('validation', { field: 'file', reason: 'notAnImage' });
    }
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
      throw AppError.badRequest('validation', { field: 'file', reason: 'unsupportedFormat', format: meta.format });
    }
    const scan = await this.scanner.scan(file.buffer, file.originalname);
    if (!scan.clean) throw AppError.badRequest('validation', { field: 'file', reason: 'rejected' });

    const keepAlpha = meta.hasAlpha === true;
    const { data, info } = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate() // apply EXIF orientation before metadata is dropped
      .toFormat(keepAlpha ? 'png' : 'jpeg', keepAlpha ? { compressionLevel: 9 } : { quality: 90, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    const id = randomUUID();
    const ext = keepAlpha ? 'png' : 'jpg';
    const storageKey = `media/${id}/original.${ext}`;
    await this.storage.put({ key: storageKey, body: data, contentType: keepAlpha ? 'image/png' : 'image/jpeg', immutable: true });

    const asset = await this.prisma.mediaAsset.create({
      data: {
        id,
        kind: 'IMAGE',
        status: 'PROCESSING',
        storageKey,
        mime: keepAlpha ? 'image/png' : 'image/jpeg',
        bytes: data.length,
        width: info.width,
        height: info.height,
        altAr: alt.altAr?.trim() || null,
        altEn: alt.altEn?.trim() || null,
        createdById: actorId,
      },
    });
    await this.queue.add('renditions', { mediaId: id }, { jobId: `renditions-${id}` });
    return this.toDto(asset);
  }

  /** Worker step: generate WebP and AVIF at each responsive width up to the original width. */
  async generateRenditions(mediaId: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset) return;
    const original = await this.storage.get(asset.storageKey);
    const largest = RENDITION_WIDTHS[RENDITION_WIDTHS.length - 1]!;
    const sourceWidth = asset.width ?? largest;
    const widths: number[] = RENDITION_WIDTHS.filter((w) => w < sourceWidth);
    widths.push(Math.min(sourceWidth, largest));

    const renditions: Rendition[] = [];
    for (const width of [...new Set(widths)]) {
      const resized = sharp(original).resize({ width, withoutEnlargement: true });
      for (const format of ['webp', 'avif'] as const) {
        const body = await resized
          .clone()
          .toFormat(format, format === 'webp' ? { quality: 80 } : { quality: 55, effort: 4 })
          .toBuffer();
        const key = `media/${mediaId}/${width}.${format}`;
        await this.storage.put({ key, body, contentType: `image/${format}`, immutable: true });
        renditions.push({ format, width, key });
      }
    }
    await this.prisma.mediaAsset.update({
      where: { id: mediaId },
      data: { status: 'READY', renditions: renditions as unknown as Prisma.InputJsonValue },
    });
  }

  async markFailed(mediaId: string, reason: string): Promise<void> {
    this.logger.error(`Rendition generation failed for ${mediaId}: ${reason}`);
    await this.prisma.mediaAsset.updateMany({ where: { id: mediaId }, data: { status: 'FAILED' } });
  }

  async list(page: number, limit: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mediaAsset.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.mediaAsset.count(),
    ]);
    return { items: items.map((a) => this.toDto(a)), total, page, limit };
  }

  async updateAlt(id: string, alt: { altAr?: string; altEn?: string }): Promise<MediaDto> {
    const asset = await this.prisma.mediaAsset.update({
      where: { id },
      data: { altAr: alt.altAr?.trim() ?? undefined, altEn: alt.altEn?.trim() ?? undefined },
    });
    return this.toDto(asset);
  }

  async remove(id: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: { _count: { select: { products: true, categories: true, collections: true } } },
    });
    if (!asset) throw AppError.notFound();
    const used = asset._count.products + asset._count.categories + asset._count.collections;
    if (used > 0) throw AppError.conflict('conflict', { reason: 'inUse', usages: used });
    const keys = [asset.storageKey, ...this.renditionsOf(asset).map((r) => r.key)];
    await this.prisma.mediaAsset.delete({ where: { id } });
    await this.storage.delete(keys);
  }

  toDto(asset: MediaAsset): MediaDto {
    const renditions = this.renditionsOf(asset);
    const smallestWebp = renditions.filter((r) => r.format === 'webp').sort((a, b) => a.width - b.width)[0];
    const url = this.storage.publicUrl(asset.storageKey);
    return {
      id: asset.id,
      status: asset.status,
      width: asset.width,
      height: asset.height,
      altAr: asset.altAr,
      altEn: asset.altEn,
      url,
      thumbnailUrl: smallestWebp ? this.storage.publicUrl(smallestWebp.key) : url,
      renditions: renditions.map((r) => ({ format: r.format, width: r.width, url: this.storage.publicUrl(r.key) })),
    };
  }

  private renditionsOf(asset: MediaAsset): Rendition[] {
    return Array.isArray(asset.renditions) ? (asset.renditions as unknown as Rendition[]) : [];
  }
}

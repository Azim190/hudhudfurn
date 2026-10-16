import { Inject, Injectable } from '@nestjs/common';
import { navigationUrl, technicianPhone } from '@hudhud/domain';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ConfiguratorService } from '../configurator/configurator.service';
import { PRIVATE_STORAGE, type StoragePort } from '../storage/storage.port';
import type { MeasurementDto, TechnicianStatusDto, UpdateMeasurementDto } from './services.dto';
import { BOOKING_INCLUDE, isoDate, riyadhToday, ServicesService } from './services.service';

const ACTIVE_FOR_TECH = ['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW'] as const;
const EDITABLE = ['EN_ROUTE', 'IN_PROGRESS'] as const;

/** The technician's field app: own jobs only, measurements with photos, signature and status. */
@Injectable()
export class TechnicianService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly services: ServicesService,
    private readonly configurator: ConfiguratorService,
    @Inject(PRIVATE_STORAGE) private readonly storage: StoragePort,
  ) {}

  private async job(technicianId: string, id: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, technicianId, status: { in: [...ACTIVE_FOR_TECH] } }, include: BOOKING_INCLUDE });
    if (!b) throw AppError.notFound({ entity: 'job' });
    return b;
  }

  /** Curtain and blind products the technician can quote, with their configurator rules. */
  async catalog() {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE', deletedAt: null, configuratorTemplate: { isActive: true, kind: { in: ['CURTAIN', 'BLIND'] } } },
      select: { id: true, nameAr: true, nameEn: true },
      orderBy: { nameEn: 'asc' },
    });
    return Promise.all(products.map(async (p) => ({ ...p, ...(await this.configurator.forProduct(p.id)) })));
  }

  async jobs(technicianId: string, date = riyadhToday()) {
    const rows = await this.prisma.booking.findMany({
      where: { technicianId, status: { in: [...ACTIVE_FOR_TECH] }, slot: { date: new Date(`${date}T00:00:00Z`) } },
      include: BOOKING_INCLUDE,
      orderBy: { slot: { startTime: 'asc' } },
    });
    return { date, items: rows.map((b) => this.jobView(b)) };
  }

  async get(technicianId: string, id: string) {
    const b = await this.job(technicianId, id);
    const product = b.productId ? await this.prisma.product.findUnique({ where: { id: b.productId }, select: { id: true, nameAr: true, nameEn: true } }) : null;
    return { ...this.jobView(b), product, notes: b.notes, signed: Boolean(b.signatureUploadId), measurements: b.measurements.map((m) => ({ ...m, photoIds: m.photos.map((p) => p.id) })) };
  }

  private jobView(b: Awaited<ReturnType<TechnicianService['job']>>) {
    const a = b.address as { recipientName: string; cityNameAr: string; cityNameEn: string; district: string | null; street: string | null; buildingNo: string | null; shortAddress: string | null };
    const text = [a.buildingNo, a.street, a.district, a.cityNameEn].filter(Boolean).join(', ');
    const date = isoDate(b.slot.date);
    return {
      id: b.id,
      number: b.number,
      type: b.type,
      status: b.status,
      slot: { date, start: b.slot.startTime, end: b.slot.endTime },
      customer: { name: b.contactName, ...technicianPhone(b.contactPhoneE164, { status: b.status, visitDate: date, today: riyadhToday() }) },
      address: b.address,
      navigationUrl: navigationUrl({ lat: b.lat ? Number(b.lat) : null, lng: b.lng ? Number(b.lng) : null, text: a.shortAddress ? `${a.shortAddress} ${text}` : text }),
      measurementCount: b.measurements.length,
      quotations: b.quotations,
      order: b.order,
    };
  }

  async setStatus(technicianId: string, id: string, dto: TechnicianStatusDto) {
    const b = await this.job(technicianId, id);
    if (dto.status === 'COMPLETED') {
      if (!b.signatureUploadId) throw AppError.badRequest('validation', { reason: 'signatureRequired' });
      if (b.type === 'MEASUREMENT' && b.measurements.length === 0) throw AppError.badRequest('validation', { reason: 'measurementsRequired' });
    }
    const updated = await this.services.move(b, dto.status, { actorId: technicianId, note: dto.note, data: dto.status === 'COMPLETED' ? { completedAt: new Date() } : undefined });
    if (dto.status === 'EN_ROUTE') {
      const tech = await this.prisma.user.findUnique({ where: { id: technicianId }, select: { fullName: true } });
      await this.services.notify(updated, 'technicianEnRoute', { name: tech?.fullName ?? '' });
    }
    return this.get(technicianId, id);
  }

  private async editable(technicianId: string, id: string) {
    const b = await this.job(technicianId, id);
    if (!(EDITABLE as readonly string[]).includes(b.status)) throw AppError.badRequest('bookingLocked');
    return b;
  }

  /** Photos must be fresh uploads from this technician that are not attached anywhere yet. */
  private async claimPhotos(technicianId: string, photoIds: string[], measurementId: string) {
    if (photoIds.length === 0) return;
    const ok = await this.prisma.customerUpload.updateMany({
      where: { id: { in: photoIds }, userId: technicianId, configurationId: null, OR: [{ measurementId: null }, { measurementId }] },
      data: { measurementId },
    });
    if (ok.count !== new Set(photoIds).size) throw AppError.badRequest('validation', { field: 'photoIds' });
  }

  async addMeasurement(technicianId: string, id: string, dto: MeasurementDto) {
    const b = await this.editable(technicianId, id);
    const m = await this.prisma.measurementRecord.create({
      data: { bookingId: b.id, roomLabel: dto.roomLabel.trim(), widthMm: dto.widthMm, heightMm: dto.heightMm, mounting: dto.mounting, notes: dto.notes?.trim() || null, sortOrder: b.measurements.length },
    });
    await this.claimPhotos(technicianId, dto.photoIds ?? [], m.id);
    return this.get(technicianId, id);
  }

  async updateMeasurement(technicianId: string, id: string, measurementId: string, dto: UpdateMeasurementDto) {
    const b = await this.editable(technicianId, id);
    if (!b.measurements.some((m) => m.id === measurementId)) throw AppError.notFound({ entity: 'measurement' });
    await this.prisma.measurementRecord.update({ where: { id: measurementId }, data: { roomLabel: dto.roomLabel?.trim(), widthMm: dto.widthMm, heightMm: dto.heightMm, mounting: dto.mounting, notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined } });
    if (dto.photoIds) await this.claimPhotos(technicianId, dto.photoIds, measurementId);
    return this.get(technicianId, id);
  }

  async deleteMeasurement(technicianId: string, id: string, measurementId: string) {
    const b = await this.editable(technicianId, id);
    if (!b.measurements.some((m) => m.id === measurementId)) throw AppError.notFound({ entity: 'measurement' });
    await this.prisma.measurementRecord.delete({ where: { id: measurementId } });
    return this.get(technicianId, id);
  }

  /** Customer signature drawn on the technician's screen (PNG), stored privately. */
  async sign(technicianId: string, id: string, dataUrl: string) {
    const b = await this.editable(technicianId, id);
    const raw = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    let png: Buffer;
    try {
      png = await sharp(raw, { limitInputPixels: 10_000_000 }).resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).png().toBuffer();
    } catch {
      throw AppError.badRequest('validation', { field: 'dataUrl' });
    }
    const meta = await sharp(png).metadata();
    const uploadId = randomUUID();
    const key = `signatures/${new Date().toISOString().slice(0, 7)}/${uploadId}.png`;
    await this.storage.put({ key, body: png, contentType: 'image/png' });
    await this.prisma.$transaction(async (tx) => {
      await tx.customerUpload.create({ data: { id: uploadId, storageKey: key, contentType: 'image/png', width: meta.width ?? 1, height: meta.height ?? 1, bytes: png.length, userId: technicianId } });
      await tx.booking.update({ where: { id: b.id }, data: { signatureUploadId: uploadId } });
    });
    return this.get(technicianId, id);
  }
}

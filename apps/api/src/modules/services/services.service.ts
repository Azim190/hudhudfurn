import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { bookingFee, canTransitionBooking, customerCanChange, generateSlots, normalizeSaudiMobile, slotStartsAt, type BookingStatus, type BookingType } from '@hudhud/domain';
import { translate, type Locale } from '@hudhud/i18n';
import { Prisma, type Booking, type PaymentMethod } from '@prisma/client';
import { AppConfig } from '../../core/config/app-config.service';
import { AppError } from '../../core/errors/app-error';
import { nextCounter, riyadhYear, sequenceNumber } from '../../core/prisma/document-counter';
import { PrismaService } from '../../core/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { ServiceOrderWriter } from '../orders/service-order.writer';
import { SettingsService } from '../settings/settings.service';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.port';
import type { AdminBookingQueryDto, BookingDto, GenerateSlotsDto, ServiceAreaDto, TechnicianDto, UpdateServiceAreaDto, UpdateSlotDto } from './services.dto';

export const BOOKING_INCLUDE = {
  area: { select: { id: true, code: true, nameAr: true, nameEn: true } },
  slot: { select: { id: true, date: true, startTime: true, endTime: true } },
  technician: { select: { userId: true, phoneE164: true, user: { select: { fullName: true } } } },
  events: { orderBy: { createdAt: 'asc' } },
  measurements: { orderBy: { sortOrder: 'asc' }, include: { photos: { select: { id: true } } } },
  quotations: { orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, total: true, validUntil: true, orderId: true } },
  feeOrder: { select: { id: true, number: true, paymentState: true, status: true } },
  order: { select: { id: true, number: true } },
} satisfies Prisma.BookingInclude;

export type BookingFull = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const riyadhToday = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

/** Customer booking of measurement and installation visits, plus the admin side of areas, slots and assignment. */
@Injectable()
export class ServicesService implements OnModuleInit {
  private readonly logger = new Logger(ServicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly orders: OrdersService,
    private readonly serviceOrders: ServiceOrderWriter,
    private readonly config: AppConfig,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  onModuleInit() {
    // A paid visit fee confirms the booking; a cancelled or expired fee order frees the slot.
    this.orders.onPaid(async (orderId) => {
      const booking = await this.prisma.booking.findUnique({ where: { feeOrderId: orderId } });
      if (booking?.status === 'REQUESTED') {
        await this.move(booking, 'CONFIRMED', { note: 'visit fee paid' });
        await this.notify(booking, 'bookingConfirmed');
      }
    });
    this.orders.onCancelled(async (orderId) => {
      const booking = await this.prisma.booking.findUnique({ where: { feeOrderId: orderId } });
      if (booking && canTransitionBooking(booking.status, 'CANCELLED')) await this.cancelInternal(booking, { reason: 'Visit fee not paid or refunded' });
    });
  }

  // ───── Notifications ─────

  async notify(booking: Booking, key: 'bookingConfirmed' | 'technicianAssigned' | 'technicianEnRoute' | 'bookingCancelled' | 'quotationReady', extra: Record<string, string> = {}) {
    try {
      const slot = await this.prisma.timeSlot.findUniqueOrThrow({ where: { id: booking.slotId } });
      const body = translate(booking.locale as Locale, `sms.${key}`, { number: booking.number, date: isoDate(slot.date), time: slot.startTime, ...extra });
      await this.sms.send({ to: booking.contactPhoneE164, body });
    } catch (err) {
      this.logger.warn({ err, bookingId: booking.id, key }, 'Booking SMS failed');
    }
  }

  // ───── Availability ─────

  /** The service area covering a city/district for a visit type. */
  private async areaFor(cityCode: string, districtId: string | undefined, type: BookingType) {
    const areas = await this.prisma.serviceArea.findMany({ where: { isActive: true, city: { code: cityCode }, types: { has: type } }, include: { districts: true }, orderBy: { code: 'asc' } });
    return areas.find((a) => a.districts.length === 0 || (districtId && a.districts.some((d) => d.districtId === districtId))) ?? null;
  }

  private async installationOrder(userId: string | undefined, orderId: string | undefined) {
    if (!orderId) return null;
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId: userId ?? '__none__' }, include: { items: { select: { configuration: true } } } });
    if (!order || !['PAID', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'DELIVERED'].includes(order.status)) throw AppError.badRequest('validation', { field: 'orderId' });
    const includesInstallation = order.items.some((i) => (i.configuration as { choices?: Array<{ group: string; code: string }> } | null)?.choices?.some((c) => c.group === 'INSTALLATION' && c.code !== 'NONE'));
    return { order, includesInstallation };
  }

  async availability(q: { cityCode: string; districtId?: string; type: BookingType; orderId?: string }, userId?: string) {
    const area = await this.areaFor(q.cityCode, q.districtId, q.type);
    if (!area) return { area: null, fee: null, days: [] };
    const rules = await this.settings.get('services.booking');
    const inst = q.type === 'INSTALLATION' ? await this.installationOrder(userId, q.orderId) : null;
    const fee = bookingFee({ measurementFee: area.measurementFee, installationFee: area.installationFee, freeInstallationAbove: area.freeInstallationAbove }, { type: q.type, orderTotal: inst?.order.total, orderIncludesInstallation: inst?.includesInstallation });
    const earliest = new Date(Date.now() + rules.leadHours * 3_600_000);
    const slots = await this.prisma.timeSlot.findMany({
      where: { areaId: area.id, isActive: true, date: { gte: new Date(`${riyadhToday()}T00:00:00Z`), lte: new Date(Date.now() + rules.horizonDays * 86_400_000) } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    const days = new Map<string, Array<{ id: string; start: string; end: string; available: boolean }>>();
    for (const s of slots) {
      const date = isoDate(s.date);
      if (slotStartsAt(date, s.startTime) < earliest) continue;
      days.set(date, [...(days.get(date) ?? []), { id: s.id, start: s.startTime, end: s.endTime, available: s.booked < s.capacity }]);
    }
    return { area: { id: area.id, nameAr: area.nameAr, nameEn: area.nameEn }, fee, days: [...days.entries()].map(([date, list]) => ({ date, slots: list })) };
  }

  /** Reserve one place in a slot; fails when the slot is full (conditional update, no overbooking). */
  private async reserveSlot(tx: Prisma.TransactionClient, slotId: string, areaId: string) {
    const n = await tx.$executeRaw`UPDATE time_slots SET booked = booked + 1 WHERE id = ${slotId}::uuid AND area_id = ${areaId}::uuid AND is_active AND booked < capacity`;
    if (n === 0) throw AppError.conflict('slotUnavailable');
  }

  private releaseSlot(tx: Prisma.TransactionClient, slotId: string) {
    return tx.$executeRaw`UPDATE time_slots SET booked = GREATEST(booked - 1, 0) WHERE id = ${slotId}::uuid`;
  }

  // ───── Customer ─────

  async book(userId: string, dto: BookingDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const resolved = await this.resolveAddress(userId, dto);
    const slot = await this.prisma.timeSlot.findUnique({ where: { id: dto.slotId }, include: { area: { include: { districts: true, city: true } } } });
    if (!slot || !slot.isActive || !slot.area.isActive || !slot.area.types.includes(dto.type)) throw AppError.conflict('slotUnavailable');
    if (slot.area.city.code !== resolved.address.cityCode) throw AppError.badRequest('validation', { field: 'slotId', reason: 'outsideArea' });
    if (slot.area.districts.length && !slot.area.districts.some((d) => d.districtId === resolved.districtId)) throw AppError.badRequest('validation', { field: 'slotId', reason: 'outsideArea' });
    const rules = await this.settings.get('services.booking');
    if (slotStartsAt(isoDate(slot.date), slot.startTime).getTime() < Date.now() + rules.leadHours * 3_600_000) throw AppError.conflict('slotUnavailable');
    const inst = dto.type === 'INSTALLATION' ? await this.installationOrder(userId, dto.orderId) : null;
    if (dto.type === 'INSTALLATION' && !inst) throw AppError.badRequest('validation', { field: 'orderId' });
    if (dto.productId && !(await this.prisma.product.findFirst({ where: { id: dto.productId, status: 'ACTIVE' } }))) throw AppError.badRequest('validation', { field: 'productId' });
    const fee = bookingFee({ measurementFee: slot.area.measurementFee, installationFee: slot.area.installationFee, freeInstallationAbove: slot.area.freeInstallationAbove }, { type: dto.type, orderTotal: inst?.order.total, orderIncludesInstallation: inst?.includesInstallation });
    const locale = dto.locale ?? user.locale;

    const booking = await this.prisma.$transaction(async (tx) => {
      await this.reserveSlot(tx, slot.id, slot.areaId);
      const year = riyadhYear();
      const number = sequenceNumber('BK', year, await nextCounter(tx, `booking:${year}`));
      const status: BookingStatus = fee > 0 ? 'REQUESTED' : 'CONFIRMED';
      return tx.booking.create({
        data: {
          number,
          userId,
          type: dto.type,
          status,
          areaId: slot.areaId,
          slotId: slot.id,
          orderId: inst?.order.id,
          fee,
          locale,
          contactName: resolved.address.recipientName,
          contactPhoneE164: resolved.address.phoneE164,
          address: resolved.address as unknown as Prisma.InputJsonValue,
          lat: dto.lat ?? resolved.lat,
          lng: dto.lng ?? resolved.lng,
          notes: dto.notes?.trim() || null,
          productId: dto.productId,
          events: { create: { toStatus: status, actorId: userId, note: 'booked' } },
        },
      });
    });

    if (fee === 0) {
      await this.notify(booking, 'bookingConfirmed');
      return { booking: await this.present(booking.id), payment: null };
    }
    try {
      const sku = dto.type === 'MEASUREMENT' ? 'SERVICE-MEASUREMENT' : 'SERVICE-INSTALLATION';
      const [nameAr, nameEn] = dto.type === 'MEASUREMENT' ? ['زيارة قياس منزلية', 'Home measurement visit'] : ['زيارة تركيب', 'Installation visit'];
      const paid = await this.serviceOrders.create({
        userId,
        locale,
        contact: { name: resolved.address.recipientName, phoneE164: resolved.address.phoneE164, email: user.email },
        address: resolved.address,
        lines: [{ sku, nameAr: `${nameAr} ${booking.number}`, nameEn: `${nameEn} ${booking.number}`, quantity: 1, unitPrice: fee, isMadeToMeasure: false }],
        paymentMethod: dto.paymentMethod ?? 'CARD',
      });
      await this.prisma.booking.update({ where: { id: booking.id }, data: { feeOrderId: paid.orderId } });
      return { booking: await this.present(booking.id), payment: { redirectUrl: paid.redirectUrl, orderId: paid.orderId } };
    } catch (err) {
      await this.cancelInternal(booking, { reason: 'Visit fee payment could not start' });
      throw err;
    }
  }

  private async resolveAddress(userId: string, dto: BookingDto) {
    if (dto.addressId) {
      const a = await this.prisma.address.findFirst({ where: { id: dto.addressId, userId }, include: { city: true, district: true } });
      if (!a) throw AppError.badRequest('validation', { field: 'addressId' });
      return {
        districtId: a.districtId ?? undefined,
        lat: a.lat,
        lng: a.lng,
        address: { recipientName: a.recipientName, phoneE164: a.phoneE164, cityCode: a.city.code, cityNameAr: a.city.nameAr, cityNameEn: a.city.nameEn, district: a.district?.nameAr ?? null, districtEn: a.district?.nameEn ?? null, street: a.street, buildingNo: a.buildingNo, postalCode: a.postalCode, shortAddress: a.shortAddress },
      };
    }
    if (!dto.address) throw AppError.badRequest('validation', { field: 'address' });
    const city = await this.prisma.city.findFirst({ where: { code: dto.address.cityCode, isActive: true } });
    if (!city) throw AppError.badRequest('validation', { field: 'address.cityCode' });
    const phone = normalizeSaudiMobile(dto.address.phone);
    if (!phone) throw AppError.badRequest('phoneInvalid');
    const district = dto.address.districtId ? await this.prisma.district.findFirst({ where: { id: dto.address.districtId, cityId: city.id } }) : null;
    return {
      districtId: district?.id,
      lat: null,
      lng: null,
      address: {
        recipientName: dto.address.recipientName.trim(),
        phoneE164: phone,
        cityCode: city.code,
        cityNameAr: city.nameAr,
        cityNameEn: city.nameEn,
        district: district?.nameAr ?? (dto.address.district?.trim() || null),
        districtEn: district?.nameEn ?? null,
        street: dto.address.street.trim(),
        buildingNo: dto.address.buildingNo ?? null,
        postalCode: dto.address.postalCode ?? null,
        shortAddress: dto.address.shortAddress?.toUpperCase() ?? null,
      },
    };
  }

  async listMine(userId: string) {
    const rows = await this.prisma.booking.findMany({ where: { userId }, include: BOOKING_INCLUDE, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((b) => this.view(b));
  }

  async getMine(userId: string, id: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, userId }, include: BOOKING_INCLUDE });
    if (!b) throw AppError.notFound({ entity: 'booking' });
    const rules = await this.settings.get('services.booking');
    return { ...this.view(b), canChange: customerCanChange(b.status, slotStartsAt(isoDate(b.slot.date), b.slot.startTime), new Date(), rules.changeCutoffHours) };
  }

  async cancelByCustomer(userId: string, id: string, reason?: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, userId }, include: { slot: true } });
    if (!b) throw AppError.notFound({ entity: 'booking' });
    const rules = await this.settings.get('services.booking');
    if (!customerCanChange(b.status, slotStartsAt(isoDate(b.slot.date), b.slot.startTime), new Date(), rules.changeCutoffHours)) throw AppError.badRequest('bookingLocked');
    await this.cancelInternal(b, { reason: reason?.trim() || 'Cancelled by customer', actorId: userId });
    return this.getMine(userId, id);
  }

  async reschedule(userId: string, id: string, slotId: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, userId }, include: { slot: true } });
    if (!b) throw AppError.notFound({ entity: 'booking' });
    const rules = await this.settings.get('services.booking');
    if (!customerCanChange(b.status, slotStartsAt(isoDate(b.slot.date), b.slot.startTime), new Date(), rules.changeCutoffHours)) throw AppError.badRequest('bookingLocked');
    const target = await this.prisma.timeSlot.findUnique({ where: { id: slotId } });
    if (!target || target.areaId !== b.areaId || slotStartsAt(isoDate(target.date), target.startTime).getTime() < Date.now() + rules.leadHours * 3_600_000) throw AppError.conflict('slotUnavailable');
    await this.prisma.$transaction(async (tx) => {
      await this.reserveSlot(tx, target.id, b.areaId);
      await this.releaseSlot(tx, b.slotId);
      // A new time may not suit the assigned technician: back to the dispatch queue.
      const status: BookingStatus = b.status === 'ASSIGNED' ? 'CONFIRMED' : b.status;
      await tx.booking.update({ where: { id }, data: { slotId: target.id, status, technicianId: status === 'CONFIRMED' ? null : b.technicianId } });
      await tx.bookingEvent.create({ data: { bookingId: id, fromStatus: b.status, toStatus: status, actorId: userId, note: `rescheduled to ${isoDate(target.date)} ${target.startTime}` } });
    });
    return this.getMine(userId, id);
  }

  /** Cancel, free the slot, and refund a paid visit fee. */
  async cancelInternal(b: Booking, input: { reason: string; actorId?: string }) {
    const done = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ status: BookingStatus }>>`SELECT status FROM bookings WHERE id = ${b.id}::uuid FOR UPDATE`;
      if (!row || !canTransitionBooking(row.status, 'CANCELLED')) return false;
      await this.releaseSlot(tx, b.slotId);
      await tx.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: input.reason } });
      await tx.bookingEvent.create({ data: { bookingId: b.id, fromStatus: row.status, toStatus: 'CANCELLED', actorId: input.actorId, note: input.reason } });
      return true;
    });
    if (!done) return;
    if (b.feeOrderId) {
      const order = await this.prisma.order.findUnique({ where: { id: b.feeOrderId } });
      if (order && order.status !== 'CANCELLED') await this.orders.cancel(order.id, { reason: input.reason, actorId: input.actorId }).catch((err) => this.logger.error({ err, bookingId: b.id }, 'Could not cancel the visit fee order'));
    }
    await this.notify(b, 'bookingCancelled');
  }

  /** Status change with history (row-locked). */
  async move(b: Pick<Booking, 'id'>, to: BookingStatus, input: { actorId?: string; note?: string; data?: Prisma.BookingUpdateInput } = {}) {
    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ status: BookingStatus }>>`SELECT status FROM bookings WHERE id = ${b.id}::uuid FOR UPDATE`;
      if (!row) throw AppError.notFound({ entity: 'booking' });
      if (!canTransitionBooking(row.status, to)) throw AppError.badRequest('bookingTransitionInvalid', { from: row.status, to });
      const updated = await tx.booking.update({ where: { id: b.id }, data: { ...input.data, status: to } });
      await tx.bookingEvent.create({ data: { bookingId: b.id, fromStatus: row.status, toStatus: to, actorId: input.actorId, note: input.note } });
      return updated;
    });
  }

  // ───── Views ─────

  async present(id: string) {
    return this.view(await this.prisma.booking.findUniqueOrThrow({ where: { id }, include: BOOKING_INCLUDE }));
  }

  view(b: BookingFull) {
    const date = isoDate(b.slot.date);
    return {
      id: b.id,
      number: b.number,
      type: b.type,
      status: b.status,
      fee: b.fee,
      area: b.area,
      slot: { id: b.slot.id, date, start: b.slot.startTime, end: b.slot.endTime },
      address: b.address,
      notes: b.notes,
      technician: b.technician ? { name: b.technician.user.fullName } : null,
      feeOrder: b.feeOrder,
      order: b.order,
      measurements: b.measurements.map((m) => ({ id: m.id, roomLabel: m.roomLabel, widthMm: m.widthMm, heightMm: m.heightMm, mounting: m.mounting, notes: m.notes, photoCount: m.photos.length })),
      quotations: b.quotations.map((q) => ({ ...q, status: q.status === 'SENT' && q.validUntil < new Date() ? 'EXPIRED' : q.status })),
      timeline: b.events.map((e) => ({ status: e.toStatus, at: e.createdAt })),
      createdAt: b.createdAt,
    };
  }

  // ───── Admin: areas and slots ─────

  listAreas() {
    return this.prisma.serviceArea.findMany({ include: { city: { select: { code: true, nameAr: true, nameEn: true } }, districts: { include: { district: { select: { id: true, nameAr: true, nameEn: true } } } }, _count: { select: { technicians: true } } }, orderBy: { code: 'asc' } });
  }

  async createArea(dto: ServiceAreaDto) {
    const city = await this.prisma.city.findUnique({ where: { code: dto.cityCode } });
    if (!city) throw AppError.badRequest('validation', { field: 'cityCode' });
    await this.assertDistricts(city.id, dto.districtIds ?? []);
    try {
      return await this.prisma.serviceArea.create({
        data: {
          code: dto.code,
          nameAr: dto.nameAr,
          nameEn: dto.nameEn,
          cityId: city.id,
          types: dto.types,
          measurementFee: dto.measurementFee,
          installationFee: dto.installationFee,
          freeInstallationAbove: dto.freeInstallationAbove ?? null,
          isActive: dto.isActive ?? true,
          districts: { create: (dto.districtIds ?? []).map((districtId) => ({ districtId })) },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw AppError.conflict('conflict', { field: 'code' });
      throw err;
    }
  }

  async updateArea(id: string, dto: UpdateServiceAreaDto) {
    const area = await this.prisma.serviceArea.findUnique({ where: { id } });
    if (!area) throw AppError.notFound({ entity: 'serviceArea' });
    const city = dto.cityCode ? await this.prisma.city.findUnique({ where: { code: dto.cityCode } }) : null;
    if (dto.cityCode && !city) throw AppError.badRequest('validation', { field: 'cityCode' });
    if (dto.districtIds) await this.assertDistricts(city?.id ?? area.cityId, dto.districtIds);
    return this.prisma.$transaction(async (tx) => {
      if (dto.districtIds) {
        await tx.serviceAreaDistrict.deleteMany({ where: { areaId: id } });
        await tx.serviceAreaDistrict.createMany({ data: dto.districtIds.map((districtId) => ({ areaId: id, districtId })) });
      }
      return tx.serviceArea.update({
        where: { id },
        data: { code: dto.code, nameAr: dto.nameAr, nameEn: dto.nameEn, cityId: city?.id, types: dto.types, measurementFee: dto.measurementFee, installationFee: dto.installationFee, freeInstallationAbove: dto.freeInstallationAbove, isActive: dto.isActive },
      });
    });
  }

  private async assertDistricts(cityId: string, ids: string[]) {
    if (ids.length && (await this.prisma.district.count({ where: { id: { in: ids }, cityId } })) !== new Set(ids).size) throw AppError.badRequest('validation', { field: 'districtIds' });
  }

  async generateSlots(areaId: string, dto: GenerateSlotsDto) {
    if (!(await this.prisma.serviceArea.findUnique({ where: { id: areaId } }))) throw AppError.notFound({ entity: 'serviceArea' });
    let slots;
    try {
      slots = generateSlots({ weekdays: dto.weekdays, windows: dto.windows, capacity: dto.capacity }, dto.from, dto.to);
    } catch (err) {
      throw AppError.badRequest('validation', { reason: (err as Error).message });
    }
    const { count } = await this.prisma.timeSlot.createMany({ data: slots.map((s) => ({ areaId, date: new Date(`${s.date}T00:00:00Z`), startTime: s.start, endTime: s.end, capacity: s.capacity })), skipDuplicates: true });
    return { created: count, skipped: slots.length - count };
  }

  listSlots(areaId: string, from: string, to: string) {
    return this.prisma.timeSlot.findMany({ where: { areaId, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] });
  }

  async updateSlot(id: string, dto: UpdateSlotDto) {
    const slot = await this.prisma.timeSlot.findUnique({ where: { id } });
    if (!slot) throw AppError.notFound({ entity: 'timeSlot' });
    if (dto.capacity !== undefined && dto.capacity < slot.booked) throw AppError.badRequest('validation', { field: 'capacity', reason: 'belowBooked', booked: slot.booked });
    return this.prisma.timeSlot.update({ where: { id }, data: dto });
  }

  // ───── Admin: bookings and technicians ─────

  async adminList(q: AdminBookingQueryDto) {
    const where: Prisma.BookingWhereInput = {
      status: q.status,
      areaId: q.areaId,
      technicianId: q.technicianId,
      ...(q.from || q.to ? { slot: { date: { gte: q.from ? new Date(`${q.from}T00:00:00Z`) : undefined, lte: q.to ? new Date(`${q.to}T00:00:00Z`) : undefined } } } : {}),
      ...(q.q ? { OR: [{ number: { contains: q.q.toUpperCase() } }, { contactPhoneE164: { contains: q.q.replace(/\D/g, '') || q.q } }, { contactName: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({ where, include: BOOKING_INCLUDE, orderBy: [{ slot: { date: 'asc' } }, { slot: { startTime: 'asc' } }], skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.booking.count({ where }),
    ]);
    return { items: items.map((b) => ({ ...this.view(b), contactName: b.contactName, contactPhoneE164: b.contactPhoneE164, technicianId: b.technicianId })), total, page: q.page, limit: q.limit };
  }

  async adminGet(id: string) {
    const b = await this.prisma.booking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
    if (!b) throw AppError.notFound({ entity: 'booking' });
    return { ...this.view(b), contactName: b.contactName, contactPhoneE164: b.contactPhoneE164, technicianId: b.technicianId, lat: b.lat, lng: b.lng, productId: b.productId, events: b.events, measurementsDetail: b.measurements };
  }

  async assign(id: string, technicianId: string | null | undefined, actorId: string) {
    const b = await this.prisma.booking.findUnique({ where: { id } });
    if (!b) throw AppError.notFound({ entity: 'booking' });
    if (!technicianId) {
      await this.move(b, 'CONFIRMED', { actorId, note: 'unassigned', data: { technician: { disconnect: true } } });
      return this.adminGet(id);
    }
    const tech = await this.prisma.technicianProfile.findUnique({ where: { userId: technicianId }, include: { areas: true } });
    if (!tech?.isActive || !tech.areas.some((a) => a.areaId === b.areaId)) throw AppError.badRequest('validation', { field: 'technicianId', reason: 'notInArea' });
    const updated = await this.move(b, 'ASSIGNED', { actorId, note: 'assigned', data: { technician: { connect: { userId: technicianId } } } });
    await this.notify(updated, 'technicianAssigned');
    return this.adminGet(id);
  }

  async adminCancel(id: string, reason: string, actorId: string) {
    const b = await this.prisma.booking.findUnique({ where: { id } });
    if (!b) throw AppError.notFound({ entity: 'booking' });
    if (!canTransitionBooking(b.status, 'CANCELLED')) throw AppError.badRequest('bookingTransitionInvalid', { from: b.status, to: 'CANCELLED' });
    await this.cancelInternal(b, { reason, actorId });
    return this.adminGet(id);
  }

  async listTechnicians() {
    const staff = await this.prisma.user.findMany({
      where: { kind: 'STAFF', deletedAt: null, roles: { some: { role: { key: 'technician' } } } },
      select: { id: true, fullName: true, email: true, status: true, technicianProfile: { include: { areas: { include: { area: { select: { id: true, code: true, nameAr: true, nameEn: true } } } } } } },
      orderBy: { fullName: 'asc' },
    });
    return staff.map((u) => ({ userId: u.id, name: u.fullName, email: u.email, status: u.status, profile: u.technicianProfile ? { phoneE164: u.technicianProfile.phoneE164, isActive: u.technicianProfile.isActive, areas: u.technicianProfile.areas.map((a) => a.area) } : null }));
  }

  async upsertTechnician(userId: string, dto: TechnicianDto) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, kind: 'STAFF', roles: { some: { role: { key: 'technician' } } } } });
    if (!user) throw AppError.badRequest('validation', { field: 'userId', reason: 'notTechnician' });
    const phone = dto.phone ? normalizeSaudiMobile(dto.phone) : null;
    if (dto.phone && !phone) throw AppError.badRequest('phoneInvalid');
    if ((await this.prisma.serviceArea.count({ where: { id: { in: dto.areaIds } } })) !== new Set(dto.areaIds).size) throw AppError.badRequest('validation', { field: 'areaIds' });
    await this.prisma.$transaction(async (tx) => {
      await tx.technicianProfile.upsert({ where: { userId }, create: { userId, phoneE164: phone, isActive: dto.isActive ?? true }, update: { phoneE164: phone ?? undefined, isActive: dto.isActive } });
      await tx.technicianArea.deleteMany({ where: { technicianId: userId } });
      await tx.technicianArea.createMany({ data: dto.areaIds.map((areaId) => ({ technicianId: userId, areaId })) });
    });
    return (await this.listTechnicians()).find((t) => t.userId === userId);
  }

  storefrontUrl(path: string) {
    return `${this.config.get('STOREFRONT_URL')}${path}`;
  }

  /** Payment methods offered for a visit fee or quotation of this amount. */
  methodsFor(total: number): Promise<PaymentMethod[]> {
    return this.serviceOrders.availableMethods(total);
  }
}

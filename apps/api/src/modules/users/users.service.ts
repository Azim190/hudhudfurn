import { Injectable } from '@nestjs/common';
import { normalizeSaudiMobile } from '@hudhud/domain';
import { ConsentPurpose, Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AddressDto, DataRequestDto, UpdateAddressDto, UpdateConsentsDto, UpdateMeDto } from './users.dto';

const MAX_ADDRESSES = 20;
/** Bump when the privacy policy text changes; consents are recorded against a version. */
export const PRIVACY_POLICY_VERSION = '2026-10-01';

const PROFILE_SELECT = {
  id: true,
  kind: true,
  phoneE164: true,
  email: true,
  fullName: true,
  locale: true,
  digits: true,
  calendar: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
    if (!user) throw AppError.notFound();
    return user;
  }

  async updateProfile(userId: string, dto: UpdateMeDto) {
    const email = dto.email?.trim().toLowerCase();
    if (email) {
      const taken = await this.prisma.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } });
      if (taken) throw AppError.conflict('emailTaken');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { fullName: dto.fullName?.trim(), email, locale: dto.locale, digits: dto.digits, calendar: dto.calendar },
      select: PROFILE_SELECT,
    });
  }

  listAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: { city: true, district: true },
    });
  }

  async createAddress(userId: string, dto: AddressDto) {
    const count = await this.prisma.address.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) throw AppError.badRequest('validation', { reason: 'tooManyAddresses' });
    const data = await this.addressData(dto);
    return this.prisma.$transaction(async (tx) => {
      const makeDefault = dto.isDefault ?? count === 0;
      if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.create({
        data: { ...data, userId, isDefault: makeDefault } as Prisma.AddressUncheckedCreateInput,
        include: { city: true, district: true },
      });
    });
  }

  async updateAddress(userId: string, id: string, dto: UpdateAddressDto) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) throw AppError.notFound();
    const data = await this.addressData({ cityId: existing.cityId, ...dto }, existing.cityId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data, include: { city: true, district: true } });
    });
  }

  async deleteAddress(userId: string, id: string) {
    const existing = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!existing) throw AppError.notFound();
    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }

  /** Latest decision per purpose; purposes never answered are reported as not granted. */
  async consents(userId: string) {
    const records = await this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { recordedAt: 'desc' },
      distinct: ['purpose'],
    });
    return Object.values(ConsentPurpose).map((purpose) => {
      const r = records.find((x) => x.purpose === purpose);
      return { purpose, granted: r?.granted ?? false, policyVersion: r?.policyVersion ?? null, recordedAt: r?.recordedAt ?? null };
    });
  }

  async updateConsents(userId: string, dto: UpdateConsentsDto, ip?: string) {
    await this.prisma.consentRecord.createMany({
      data: dto.items.map((i) => ({
        userId,
        purpose: i.purpose,
        granted: i.granted,
        policyVersion: PRIVACY_POLICY_VERSION,
        ip,
      })),
    });
    return this.consents(userId);
  }

  async createDataRequest(userId: string, dto: DataRequestDto) {
    const open = await this.prisma.dataSubjectRequest.findFirst({
      where: { userId, type: dto.type, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    if (open) return open;
    return this.prisma.dataSubjectRequest.create({ data: { userId, type: dto.type, note: dto.note } });
  }

  listDataRequests(userId: string) {
    return this.prisma.dataSubjectRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  private async addressData(dto: Partial<AddressDto>, currentCityId?: string) {
    let phoneE164: string | undefined;
    if (dto.phone !== undefined) {
      const normalized = normalizeSaudiMobile(dto.phone);
      if (!normalized) throw AppError.badRequest('phoneInvalid');
      phoneE164 = normalized;
    }
    const cityId = dto.cityId ?? currentCityId;
    if (dto.cityId) {
      const city = await this.prisma.city.findFirst({ where: { id: dto.cityId, isActive: true } });
      if (!city) throw AppError.badRequest('validation', { field: 'cityId' });
    }
    if (dto.districtId) {
      const district = await this.prisma.district.findFirst({ where: { id: dto.districtId, cityId } });
      if (!district) throw AppError.badRequest('validation', { field: 'districtId' });
    }
    const { phone: _phone, isDefault: _isDefault, shortAddress, ...rest } = dto;
    return {
      ...rest,
      ...(phoneE164 ? { phoneE164 } : {}),
      ...(shortAddress ? { shortAddress: shortAddress.toUpperCase() } : {}),
    } satisfies Prisma.AddressUncheckedUpdateInput;
  }
}

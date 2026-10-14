import { Injectable } from '@nestjs/common';
import type { RoleKey } from '@hudhud/domain';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StaffAuthService } from '../auth/application/staff-auth.service';
import { TokenService } from '../auth/application/token.service';
import { RbacService } from '../rbac/rbac.service';
import type { CreateStaffDto, UpdateStaffDto } from './staff.dto';

const STAFF_SELECT = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  totp: { select: { confirmedAt: true } },
  roles: { select: { role: { select: { key: true, nameAr: true, nameEn: true } } } },
} satisfies Prisma.UserSelect;

type StaffRow = Prisma.UserGetPayload<{ select: typeof STAFF_SELECT }>;

function present(row: StaffRow) {
  const { totp, roles, ...rest } = row;
  return { ...rest, twoFactorEnabled: Boolean(totp?.confirmedAt), roles: roles.map((r) => r.role) };
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly tokens: TokenService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  async list() {
    const rows = await this.prisma.user.findMany({
      where: { kind: 'STAFF', status: { not: 'DELETED' } },
      select: STAFF_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(present);
  }

  async get(id: string) {
    const row = await this.prisma.user.findFirst({ where: { id, kind: 'STAFF' }, select: STAFF_SELECT });
    if (!row) throw AppError.notFound();
    return present(row);
  }

  async create(actorId: string, dto: CreateStaffDto) {
    await this.assertMayGrant(actorId, dto.roleKeys);
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw AppError.conflict('emailTaken');
    }
    const roles = await this.rolesByKey(dto.roleKeys);
    const row = await this.prisma.user.create({
      data: {
        kind: 'STAFF',
        email,
        fullName: dto.fullName.trim(),
        passwordHash: await StaffAuthService.hashPassword(dto.temporaryPassword),
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      select: STAFF_SELECT,
    });
    return present(row);
  }

  async update(actorId: string, id: string, dto: UpdateStaffDto) {
    const current = await this.get(id);
    const currentKeys = current.roles.map((r) => r.key as RoleKey);

    if (dto.status === 'BLOCKED' && id === actorId) throw AppError.forbidden();
    if (dto.roleKeys) {
      // Changing who holds `owner` (either direction) requires being an owner.
      const ownerChanged = currentKeys.includes('owner') !== dto.roleKeys.includes('owner');
      if (ownerChanged) await this.assertMayGrant(actorId, ['owner']);
      else await this.assertMayGrant(actorId, dto.roleKeys.filter((k) => !currentKeys.includes(k)));
    }
    const losesOwner =
      currentKeys.includes('owner') &&
      ((dto.roleKeys && !dto.roleKeys.includes('owner')) || dto.status === 'BLOCKED');
    if (losesOwner) await this.assertNotLastOwner(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { fullName: dto.fullName?.trim(), status: dto.status } });
      if (dto.roleKeys) {
        const roles = await this.rolesByKey(dto.roleKeys);
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) });
      }
    });
    this.rbac.invalidate(id);
    if (dto.status === 'BLOCKED') await this.tokens.revokeAllForUser(id);
    return this.get(id);
  }

  async resetTwoFactor(actorId: string, id: string) {
    const target = await this.get(id);
    if (target.roles.some((r) => r.key === 'owner')) await this.assertMayGrant(actorId, ['owner']);
    await this.staffAuth.resetTotp(id);
    return this.get(id);
  }

  private async rolesByKey(keys: RoleKey[]) {
    const roles = await this.prisma.role.findMany({ where: { key: { in: [...new Set(keys)] } } });
    if (roles.length !== new Set(keys).size) throw AppError.badRequest('validation', { field: 'roleKeys' });
    return roles;
  }

  /** Only owners may grant or revoke the owner role. */
  private async assertMayGrant(actorId: string, keys: RoleKey[]): Promise<void> {
    if (!keys.includes('owner')) return;
    const { roles } = await this.rbac.resolve(actorId);
    if (!roles.includes('owner')) throw AppError.forbidden();
  }

  private async assertNotLastOwner(userId: string): Promise<void> {
    const owners = await this.prisma.user.count({
      where: {
        kind: 'STAFF',
        status: 'ACTIVE',
        id: { not: userId },
        roles: { some: { role: { key: 'owner' } } },
      },
    });
    if (owners === 0) throw AppError.conflict('lastOwner');
  }
}

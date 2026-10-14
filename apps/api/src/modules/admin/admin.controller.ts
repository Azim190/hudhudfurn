import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@hudhud/domain';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Audit } from '../audit/audit.interceptor';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, RequirePermissions, StaffOnly } from '../auth/interface/decorators';
import { RbacService } from '../rbac/rbac.service';
import { UsersService } from '../users/users.service';
import { AuditQueryDto, CreateStaffDto, UpdateStaffDto } from './staff.dto';
import { StaffService } from './staff.service';

@ApiTags('admin')
@ApiBearerAuth()
@StaffOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly rbac: RbacService,
    private readonly staff: StaffService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  /** The signed-in staff member with roles and effective permissions (drives admin UI gating). */
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const [profile, { roles, permissions }, roleNames] = await Promise.all([
      this.users.profile(user.id),
      this.rbac.resolve(user.id),
      this.prisma.role.findMany({
        where: { users: { some: { userId: user.id } } },
        select: { key: true, nameAr: true, nameEn: true },
      }),
    ]);
    return { ...profile, roles, roleNames, permissions: [...permissions].sort() };
  }

  @Get('permissions')
  @RequirePermissions('rbac.read')
  permissions() {
    return PERMISSIONS.map((key) => ({ key, group: key.split('.')[0] }));
  }

  @Get('roles')
  @RequirePermissions('rbac.read')
  async roles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: { permissions: { select: { permissionKey: true } }, _count: { select: { users: true } } },
    });
    return roles.map(({ permissions, _count, ...r }) => ({
      ...r,
      permissions: permissions.map((p) => p.permissionKey),
      userCount: _count.users,
    }));
  }

  @Get('staff')
  @RequirePermissions('rbac.read')
  listStaff() {
    return this.staff.list();
  }

  @Get('staff/:id')
  @RequirePermissions('rbac.read')
  getStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.get(id);
  }

  @Post('staff')
  @RequirePermissions('rbac.write')
  @Audit('staff.create', { entityType: 'user' })
  createStaff(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.staff.create(user.id, dto);
  }

  @Patch('staff/:id')
  @RequirePermissions('rbac.write')
  @Audit('staff.update', { entityType: 'user', idParam: 'id' })
  updateStaff(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(user.id, id, dto);
  }

  @Post('staff/:id/reset-2fa')
  @RequirePermissions('rbac.write')
  @Audit('staff.reset2fa', { entityType: 'user', idParam: 'id' })
  resetTwoFactor(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.resetTwoFactor(user.id, id);
  }

  @Get('audit-logs')
  @RequirePermissions('audit.view')
  auditLogs(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }
}

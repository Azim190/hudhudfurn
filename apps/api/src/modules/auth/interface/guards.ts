import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { hasAllPermissions, type Permission } from '@hudhud/domain';
import type { Request } from 'express';
import { AppConfig } from '../../../core/config/app-config.service';
import { AppError } from '../../../core/errors/app-error';
import { RbacService } from '../../rbac/rbac.service';
import { TokenService } from '../application/token.service';
import type { AccessTokenClaims } from '../auth.types';
import { IS_PUBLIC, REQUIRED_PERMISSIONS, STAFF_ONLY } from './decorators';

/** Global guard: every route requires a valid Bearer access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;

    if (!token) {
      if (isPublic) return true;
      throw AppError.unauthorized();
    }

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        audience: 'hudhud-api',
        issuer: 'hudhud',
      });
    } catch {
      if (isPublic) return true; // optional auth on public routes: an expired token just means anonymous
      throw AppError.unauthorized('sessionExpired');
    }
    if (!(await this.tokens.isFamilyActive(claims.sub, claims.fid))) {
      if (isPublic) return true;
      throw AppError.unauthorized('sessionExpired');
    }
    req.user = { id: claims.sub, kind: claims.kind, sessionId: claims.sid, familyId: claims.fid, mfa: claims.mfa };
    return true;
  }
}

/** Global guard: enforces @StaffOnly() and @RequirePermissions(...). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const required = this.reflector.getAllAndMerge<Permission[]>(REQUIRED_PERMISSIONS, targets) ?? [];
    const staffOnly = this.reflector.getAllAndOverride<boolean>(STAFF_ONLY, targets) ?? false;
    if (!staffOnly && required.length === 0) return true;

    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (!user) throw AppError.unauthorized();
    if (user.kind !== 'STAFF') throw AppError.forbidden();
    if (!user.mfa) throw AppError.forbidden('totpRequired');

    if (required.length === 0) return true;
    const { permissions } = await this.rbac.resolve(user.id);
    if (!hasAllPermissions(permissions, required)) throw AppError.forbidden();
    return true;
  }
}

import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@hudhud/domain';
import type { Request } from 'express';
import type { AuthUser, ClientContext } from '../auth.types';

export const IS_PUBLIC = 'auth:isPublic';
export const REQUIRED_PERMISSIONS = 'auth:permissions';
export const STAFF_ONLY = 'auth:staffOnly';

/** Skip authentication for this route or controller. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Staff with completed 2FA and every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Any staff member with completed 2FA (no specific permission). */
export const StaffOnly = () => SetMetadata(STAFF_ONLY, true);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest<Request>().user!,
);

export const Client = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ClientContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return { ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 512) };
  },
);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

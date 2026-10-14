import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

export const AUDIT_META = 'audit:meta';

export interface AuditMeta {
  action: string;
  entityType?: string;
  /** Route param holding the entity id; falls back to `id` in the response body. */
  idParam?: string;
}

/** Record a successful call of this handler in the audit log. */
export const Audit = (action: string, opts: Omit<AuditMeta, 'action'> = {}) =>
  SetMetadata(AUDIT_META, { action, ...opts } satisfies AuditMeta);

/** Services may attach the pre-change state so the log shows a before/after diff. */
export function setAuditBefore(req: Request, before: unknown): void {
  (req as Request & { auditBefore?: unknown }).auditBefore = before;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_META, ctx.getHandler());
    if (!meta) return next.handle();
    const req = ctx.switchToHttp().getRequest<Request & { auditBefore?: unknown }>();

    return next.handle().pipe(
      tap((result) => {
        const param = meta.idParam ? req.params[meta.idParam] : undefined;
        const fromParam = Array.isArray(param) ? param[0] : param;
        const fromBody =
          result && typeof result === 'object' && 'id' in result ? String((result as { id: unknown }).id) : undefined;
        void this.audit.record({
          actorId: req.user?.id,
          action: meta.action,
          entityType: meta.entityType,
          entityId: fromParam ?? fromBody,
          before: req.auditBefore,
          after: { request: req.body, result },
          ip: req.ip,
          userAgent: req.headers['user-agent']?.slice(0, 512),
        });
      }),
    );
  }
}

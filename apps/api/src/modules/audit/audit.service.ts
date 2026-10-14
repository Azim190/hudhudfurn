import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

const SENSITIVE_KEYS =
  /^(password|passwordHash|newPassword|temporaryPassword|secret|\w*token|code|otp|recoveryCodes?|cardNumber|cvv|pan|iban)$/i;

/** Recursively replace values under sensitive keys so audit rows never hold credentials. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_KEYS.test(k) ? '[REDACTED]' : redact(v, depth + 1),
      ]),
    );
  }
  return value;
}

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before: this.json(entry.before),
          after: this.json(entry.after),
          ip: entry.ip,
          userAgent: entry.userAgent,
        },
      });
    } catch (err) {
      // Auditing must never break the business operation, but failures must be visible.
      this.logger.error({ err, action: entry.action }, 'Failed to write audit log');
    }
  }

  async list(filter: { actorId?: string; entityType?: string; entityId?: string; action?: string; page: number; limit: number }) {
    const where: Prisma.AuditLogWhereInput = {
      actorId: filter.actorId,
      entityType: filter.entityType,
      entityId: filter.entityId,
      action: filter.action ? { startsWith: filter.action } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        include: { actor: { select: { id: true, fullName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: filter.page, limit: filter.limit };
  }

  private json(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) return Prisma.JsonNull;
    return JSON.parse(JSON.stringify(redact(value))) as Prisma.InputJsonValue;
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

const CACHE_TTL_MS = 30_000;

/** Resolves a staff member's effective permissions (union of their roles), cached briefly. */
@Injectable()
export class RbacService {
  private readonly cache = new Map<string, { at: number; perms: Set<string>; roles: string[] }>();

  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string): Promise<{ roles: string[]; permissions: Set<string> }> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { roles: hit.roles, permissions: hit.perms };

    const assignments = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { key: true, permissions: { select: { permissionKey: true } } } } },
    });
    const roles = assignments.map((a) => a.role.key);
    const perms = new Set(assignments.flatMap((a) => a.role.permissions.map((p) => p.permissionKey)));
    this.cache.set(userId, { at: Date.now(), perms, roles });
    return { roles, permissions: perms };
  }

  invalidate(userId?: string): void {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }
}

import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';

const TTL_MS = 24 * 3_600_000;
export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,100}$/;

/**
 * Idempotency-Key handling for non-repeatable POSTs (order placement). The first request with a
 * key runs and its response is stored; repeats return the stored response; a repeat with a
 * different body is rejected; a repeat while the first is still running gets 409. Failed requests
 * release the key so the client can retry after fixing the problem.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(scope: string, key: string, body: unknown, fn: () => Promise<T>): Promise<T> {
    if (!IDEMPOTENCY_KEY.test(key)) throw AppError.badRequest('validation', { field: 'Idempotency-Key' });
    const requestHash = createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
    const claimed = await this.claim(scope, key, requestHash);
    if (!claimed) {
      const row = await this.prisma.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
      if (!row) return this.run(scope, key, body, fn);
      if (row.requestHash !== requestHash) throw new AppError('idempotencyMismatch', 422);
      if (row.response === null) throw AppError.conflict('requestInProgress');
      return row.response as T;
    }
    try {
      const result = await fn();
      await this.prisma.idempotencyKey.update({ where: { scope_key: { scope, key } }, data: { status: 201, response: result as Prisma.InputJsonValue } });
      return result;
    } catch (err) {
      await this.prisma.idempotencyKey.delete({ where: { scope_key: { scope, key } } }).catch(() => undefined);
      throw err;
    }
  }

  private async claim(scope: string, key: string, requestHash: string): Promise<boolean> {
    await this.prisma.idempotencyKey.deleteMany({ where: { scope, key, expiresAt: { lt: new Date() } } });
    try {
      await this.prisma.idempotencyKey.create({ data: { scope, key, requestHash, expiresAt: new Date(Date.now() + TTL_MS) } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
  }

  purgeExpired() {
    return this.prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
}

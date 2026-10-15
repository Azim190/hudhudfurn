import type { Prisma } from '@prisma/client';

/**
 * Next value of a gap-free counter (order and invoice numbers). The upsert takes a row lock, so
 * concurrent transactions queue up and a rolled-back transaction gives its number back.
 */
export async function nextCounter(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO document_counters (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = document_counters.value + 1
    RETURNING value`;
  return rows[0]!.value;
}

/** Calendar year in Saudi time (UTC+3), used to reset yearly sequences. */
export function riyadhYear(d = new Date()): number {
  return new Date(d.getTime() + 3 * 3_600_000).getUTCFullYear();
}

export const sequenceNumber = (prefix: string, year: number, n: number) => `${prefix}-${year}-${String(n).padStart(6, '0')}`;

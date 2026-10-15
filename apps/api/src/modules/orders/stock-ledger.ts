import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/app-error';

export interface ReservationRequest {
  orderItemId: string;
  variantId: string;
  sku: string;
  quantity: number;
}

/**
 * Stock reservations for orders. Every change locks the stock_levels rows it touches
 * (SELECT … FOR UPDATE), so two checkouts can never sell the same unit, and every change writes a
 * stock movement for the audit trail. Lifecycle: reserve → commit (sale) or release; a committed
 * reservation can be restocked when an order is cancelled.
 */
@Injectable()
export class StockLedger {
  async reserve(tx: Prisma.TransactionClient, orderId: string, requests: ReservationRequest[]): Promise<void> {
    // Lock in a stable order (by variant) to avoid deadlocks between concurrent checkouts.
    const byVariant = [...requests].sort((a, b) => a.variantId.localeCompare(b.variantId));
    for (const r of byVariant) {
      const levels = await tx.$queryRaw<Array<{ location_id: string; on_hand: number; reserved: number }>>`
        SELECT s.location_id, s.on_hand, s.reserved
        FROM stock_levels s JOIN locations l ON l.id = s.location_id
        WHERE s.variant_id = ${r.variantId}::uuid AND l.is_active
        ORDER BY (s.on_hand - s.reserved) DESC, s.location_id
        FOR UPDATE OF s`;
      const available = levels.reduce((sum, l) => sum + Math.max(0, l.on_hand - l.reserved), 0);
      if (available < r.quantity) {
        throw available <= 0 ? AppError.badRequest('outOfStock', { sku: r.sku }) : AppError.badRequest('insufficientStock', { sku: r.sku, available });
      }
      let remaining = r.quantity;
      for (const level of levels) {
        if (remaining === 0) break;
        const take = Math.min(remaining, level.on_hand - level.reserved);
        if (take <= 0) continue;
        remaining -= take;
        await tx.$executeRaw`UPDATE stock_levels SET reserved = reserved + ${take}, updated_at = now() WHERE variant_id = ${r.variantId}::uuid AND location_id = ${level.location_id}::uuid`;
        await tx.stockReservation.create({ data: { orderId, orderItemId: r.orderItemId, variantId: r.variantId, locationId: level.location_id, quantity: take } });
        await tx.stockMovement.create({ data: { variantId: r.variantId, locationId: level.location_id, quantity: take, reason: 'RESERVE', refType: 'order', refId: orderId } });
      }
    }
  }

  /** The sale is final: reserved units leave the shelf. */
  async commit(tx: Prisma.TransactionClient, orderId: string): Promise<string[]> {
    const rows = await this.active(tx, orderId);
    for (const r of rows) {
      await tx.$executeRaw`UPDATE stock_levels SET on_hand = on_hand - ${r.quantity}, reserved = reserved - ${r.quantity}, updated_at = now() WHERE variant_id = ${r.variantId}::uuid AND location_id = ${r.locationId}::uuid`;
      await tx.stockMovement.create({ data: { variantId: r.variantId, locationId: r.locationId, quantity: -r.quantity, reason: 'SALE', refType: 'order', refId: orderId } });
    }
    await tx.stockReservation.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { status: 'COMMITTED' } });
    return rows.map((r) => r.variantId);
  }

  /** Unpaid or cancelled before the sale: give the units back to available stock. */
  async release(tx: Prisma.TransactionClient, orderId: string): Promise<string[]> {
    const rows = await this.active(tx, orderId);
    for (const r of rows) {
      await tx.$executeRaw`UPDATE stock_levels SET reserved = reserved - ${r.quantity}, updated_at = now() WHERE variant_id = ${r.variantId}::uuid AND location_id = ${r.locationId}::uuid`;
      await tx.stockMovement.create({ data: { variantId: r.variantId, locationId: r.locationId, quantity: -r.quantity, reason: 'RELEASE', refType: 'order', refId: orderId } });
    }
    await tx.stockReservation.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { status: 'RELEASED' } });
    return rows.map((r) => r.variantId);
  }

  /** Cancelled after the sale (not yet shipped): put the units back on the shelf. */
  async restock(tx: Prisma.TransactionClient, orderId: string): Promise<string[]> {
    const rows = await tx.stockReservation.findMany({ where: { orderId, status: 'COMMITTED' }, orderBy: { variantId: 'asc' } });
    for (const r of rows) {
      await tx.$queryRaw`SELECT 1 FROM stock_levels WHERE variant_id = ${r.variantId}::uuid AND location_id = ${r.locationId}::uuid FOR UPDATE`;
      await tx.$executeRaw`UPDATE stock_levels SET on_hand = on_hand + ${r.quantity}, updated_at = now() WHERE variant_id = ${r.variantId}::uuid AND location_id = ${r.locationId}::uuid`;
      await tx.stockMovement.create({ data: { variantId: r.variantId, locationId: r.locationId, quantity: r.quantity, reason: 'RETURN', refType: 'order', refId: orderId, note: 'Order cancelled' } });
    }
    await tx.stockReservation.updateMany({ where: { orderId, status: 'COMMITTED' }, data: { status: 'RELEASED' } });
    return rows.map((r) => r.variantId);
  }

  private async active(tx: Prisma.TransactionClient, orderId: string) {
    const rows = await tx.stockReservation.findMany({ where: { orderId, status: 'ACTIVE' }, orderBy: [{ variantId: 'asc' }, { locationId: 'asc' }] });
    for (const r of rows) await tx.$queryRaw`SELECT 1 FROM stock_levels WHERE variant_id = ${r.variantId}::uuid AND location_id = ${r.locationId}::uuid FOR UPDATE`;
    return rows;
  }
}

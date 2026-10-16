import type { Halalas } from '../money/money';

/**
 * Measurement and installation visits.
 *
 * Lifecycle: REQUESTED (awaiting the visit-fee payment) → CONFIRMED → ASSIGNED (technician) →
 * EN_ROUTE → IN_PROGRESS → COMPLETED. Visits can be cancelled until the technician sets off, and a
 * visit where nobody is home ends as NO_SHOW.
 */
export const BOOKING_TYPES = ['MEASUREMENT', 'INSTALLATION'] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

export const BOOKING_STATUSES = ['REQUESTED', 'CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  REQUESTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'CANCELLED', 'NO_SHOW'],
  EN_ROUTE: ['IN_PROGRESS', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses a technician may set from the field app. */
export const TECHNICIAN_STATUSES: readonly BookingStatus[] = ['EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW'];

/** Customers may cancel or reschedule until `cutoffHours` before the visit, and only before the technician sets off. */
export function customerCanChange(status: BookingStatus, slotStart: Date, now: Date, cutoffHours: number): boolean {
  if (!['REQUESTED', 'CONFIRMED', 'ASSIGNED'].includes(status)) return false;
  return slotStart.getTime() - now.getTime() >= cutoffHours * 3_600_000;
}

export interface FeeRules {
  measurementFee: Halalas;
  installationFee: Halalas;
  /** Installation is free for orders at or above this total (null: never free). */
  freeInstallationAbove: Halalas | null;
}

/** Fee charged when booking. Installation of an order that already includes installation is free. */
export function bookingFee(rules: FeeRules, input: { type: BookingType; orderTotal?: Halalas; orderIncludesInstallation?: boolean }): Halalas {
  if (input.type === 'MEASUREMENT') return rules.measurementFee;
  if (input.orderIncludesInstallation) return 0;
  if (rules.freeInstallationAbove !== null && (input.orderTotal ?? 0) >= rules.freeInstallationAbove) return 0;
  return rules.installationFee;
}

/** Customer phone as the technician sees it: full only on the visit day or once under way. */
export function technicianPhone(phoneE164: string, input: { status: BookingStatus; visitDate: string; today: string }): { phone: string; masked: boolean } {
  const reveal = input.visitDate === input.today || input.status === 'EN_ROUTE' || input.status === 'IN_PROGRESS';
  if (reveal) return { phone: phoneE164, masked: false };
  return { phone: `${phoneE164.slice(0, 6)}${'•'.repeat(Math.max(0, phoneE164.length - 8))}${phoneE164.slice(-2)}`, masked: true };
}

/** Navigation link for the visit address (coordinates when known, otherwise the text address). */
export function navigationUrl(address: { lat?: number | null; lng?: number | null; text: string }): string {
  if (address.lat != null && address.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${address.lat},${address.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.text)}`;
}

export interface SlotTemplate {
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  /** "HH:MM" Riyadh local time. */
  windows: Array<{ start: string; end: string }>;
  capacity: number;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Expand a weekly template into dated slots between two ISO dates (inclusive). */
export function generateSlots(template: SlotTemplate, fromDate: string, toDate: string): Array<{ date: string; start: string; end: string; capacity: number }> {
  for (const w of template.windows) {
    if (!HHMM.test(w.start) || !HHMM.test(w.end) || w.end <= w.start) throw new RangeError(`Invalid window ${w.start}–${w.end}`);
  }
  if (!Number.isInteger(template.capacity) || template.capacity < 1 || template.capacity > 100) throw new RangeError('capacity must be 1–100');
  const out: Array<{ date: string; start: string; end: string; capacity: number }> = [];
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  if (!(from <= to) || to.getTime() - from.getTime() > 92 * 86_400_000) throw new RangeError('Date range must be 0–92 days');
  for (let d = from; d <= to; d = new Date(d.getTime() + 86_400_000)) {
    if (!template.weekdays.includes(d.getUTCDay())) continue;
    const date = d.toISOString().slice(0, 10);
    for (const w of template.windows) out.push({ date, start: w.start, end: w.end, capacity: template.capacity });
  }
  return out;
}

/** A slot's start as an absolute time (Saudi Arabia is UTC+3 all year). */
export function slotStartsAt(date: string, start: string): Date {
  return new Date(`${date}T${start}:00+03:00`);
}

export interface QuotationLineInput {
  unitPrice: Halalas;
  quantity: number;
}

/**
 * Quotation total. A paid measurement-visit fee is credited when the quotation is accepted within
 * the credit window, but never below zero.
 */
export function quotationTotals(lines: QuotationLineInput[], visitCredit: Halalas): { subtotal: Halalas; credit: Halalas; total: Halalas } {
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const credit = Math.min(Math.max(0, visitCredit), subtotal);
  return { subtotal, credit, total: subtotal - credit };
}

/** How a measured mounting maps onto the codes a template offers (blinds use inside/outside the recess). */
const MOUNTING_EQUIVALENTS: Record<MeasuredMounting, readonly string[]> = {
  WALL: ['WALL', 'OUTSIDE'],
  CEILING: ['CEILING', 'OUTSIDE'],
  RECESS: ['RECESS', 'INSIDE'],
};
export type MeasuredMounting = 'WALL' | 'CEILING' | 'RECESS';

/** The template's MOUNTING option matching what the technician measured, or undefined to keep its default. */
export function mountingChoice(measured: MeasuredMounting, available: readonly string[]): string | undefined {
  return MOUNTING_EQUIVALENTS[measured].find((code) => available.includes(code));
}

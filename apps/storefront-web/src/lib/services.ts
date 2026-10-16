import 'server-only';
import { ApiError, apiFetch, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { cookies } from 'next/headers';

export interface BookingView {
  id: string;
  number: string;
  type: 'MEASUREMENT' | 'INSTALLATION';
  status: string;
  fee: number;
  area: { nameAr: string; nameEn: string };
  slot: { id: string; date: string; start: string; end: string };
  address: { recipientName: string; cityCode: string; cityNameAr: string; cityNameEn: string; district: string | null; street: string | null; buildingNo: string | null };
  notes: string | null;
  technician: { name: string | null } | null;
  feeOrder: { id: string; number: string; paymentState: string; status: string } | null;
  order: { id: string; number: string } | null;
  measurements: Array<{ id: string; roomLabel: string; widthMm: number; heightMm: number; mounting: string }>;
  quotations: Array<{ id: string; number: string; status: string; total: number; validUntil: string }>;
  timeline: Array<{ status: string; at: string }>;
  createdAt: string;
  /** Only on the single-booking read: whether the customer may still reschedule or cancel online. */
  canChange?: boolean;
}

export interface QuotationView {
  id: string;
  number: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';
  validUntil: string;
  subtotal: number;
  credit: number;
  total: number;
  notes: string | null;
  orderId: string | null;
  booking: { number: string };
  lines: Array<{ id: string; nameAr: string; nameEn: string | null; quantity: number; unitPrice: number; total: number; configuration: { kind: string; specs: Record<string, number | string>; choices: Array<{ group: string; code: string; nameAr: string; nameEn: string }> } }>;
  paymentMethods: Array<'CARD' | 'TABBY' | 'TAMARA'>;
}

async function authed<T>(path: string, locale: string): Promise<T | null> {
  const token = (await cookies()).get(STOREFRONT_COOKIES.access)?.value;
  if (!token) return null;
  try {
    return await apiFetch<T>(path, { token, locale });
  } catch (err) {
    if (err instanceof ApiError && [400, 401, 403, 404].includes(err.status)) return null;
    throw err;
  }
}

export const getMyBookings = (locale: string) => authed<BookingView[]>('/services/bookings', locale);
export const getBooking = (id: string, locale: string) => authed<BookingView>(`/services/bookings/${id}`, locale);
export const getQuotation = (number: string, locale: string) => authed<QuotationView>(`/quotations/${number}`, locale);
export const getMyQuotations = (locale: string) => authed<Array<{ id: string; number: string; status: string; total: number; validUntil: string; createdAt: string; booking: { number: string } }>>('/quotations', locale);

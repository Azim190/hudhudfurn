import 'server-only';
import { ApiError, apiFetch, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { cookies } from 'next/headers';
import { ORDERS_COOKIE, orderTokenFor } from './order-access';

export interface OrderItemView {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string | null;
  options: Array<{ attributeKey: string; nameAr: string; nameEn: string | null; labelAr: string; labelEn: string | null }>;
  imageUrl: string | null;
  isSample: boolean;
  isMadeToMeasure: boolean;
  lengthCm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  giftWrap: boolean;
  giftWrapTotal: number;
  giftMessage: string | null;
  total: number;
}

export interface OrderView {
  id: string;
  number: string;
  status: string;
  paymentMethod: 'CARD' | 'TABBY' | 'TAMARA' | 'COD';
  paymentState: string;
  fulfillment: 'DELIVERY' | 'PICKUP';
  placedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
  contactName: string;
  shippingAddress: { recipientName: string; phoneE164: string; cityNameAr: string; cityNameEn: string; district: string | null; districtEn: string | null; street: string | null; buildingNo: string | null; postalCode: string | null; shortAddress: string | null } | null;
  pickupLocation: { id: string; nameAr: string; nameEn: string | null } | null;
  shipping: { nameAr: string | null; nameEn: string | null } | null;
  eta: { minDays: number; maxDays: number } | null;
  items: OrderItemView[];
  totals: { subtotal: number; discount: number; giftWrap: number; shipping: number; codFee: number; net: number; vat: number; total: number; refunded: number };
  vatRateBp: number;
  couponCode: string | null;
  promotions: Array<{ nameAr: string; nameEn: string; discount: number; code?: string }>;
  timeline: Array<{ status: string; at: string }>;
  invoices: Array<{ id: string; kind: 'INVOICE' | 'CREDIT_NOTE'; number: string; issuedAt: string; total: number }>;
  payment: { status: string; provider: string; sourceSummary: string | null; failureReason: string | null } | null;
  canRetryPayment: boolean;
  canCancel: boolean;
}

export interface InvoiceView {
  id: string;
  kind: 'INVOICE' | 'CREDIT_NOTE';
  number: string;
  uuid: string;
  icv: number;
  orderNumber: string;
  originalNumber: string | null;
  reason: string | null;
  issuedAt: string;
  seller: { nameAr: string; nameEn: string; vatNumber: string; crn?: string; street?: string; buildingNumber?: string; district?: string; city?: string; postalCode?: string };
  lines: Array<{ id: number; nameAr: string; nameEn: string; quantity: number; priceNet: number; discountNet: number; net: number; vat: number; vatRateBp: number; gross: number }>;
  vatBreakdown: Array<{ rateBp: number; net: number; vat: number }>;
  totals: { net: number; vat: number; total: number };
  qr: string;
}

async function credentials(orderId: string) {
  const jar = await cookies();
  const access = jar.get(STOREFRONT_COOKIES.access)?.value ?? null;
  const token = orderTokenFor(jar.get(ORDERS_COOKIE)?.value, orderId);
  return { token: access, headers: token ? { 'X-Order-Token': token } : undefined };
}

/** The order if this visitor may see it (owner session or guest token cookie), else null. */
export async function getOrder(orderId: string, locale: string): Promise<OrderView | null> {
  try {
    return await apiFetch<OrderView>(`/orders/${orderId}`, { ...(await credentials(orderId)), locale });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400 || err.status === 401)) return null;
    throw err;
  }
}

export async function getInvoice(orderId: string, invoiceId: string, locale: string): Promise<InvoiceView | null> {
  try {
    return await apiFetch<InvoiceView>(`/orders/${orderId}/invoices/${invoiceId}`, { ...(await credentials(orderId)), locale });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400 || err.status === 401)) return null;
    throw err;
  }
}

export async function getMyOrders(locale: string, page = 1) {
  const access = (await cookies()).get(STOREFRONT_COOKIES.access)?.value;
  if (!access) return null;
  try {
    return await apiFetch<{ items: Array<{ id: string; number: string; status: string; paymentState: string; placedAt: string; total: number; itemCount: number; preview: Array<{ nameAr: string; nameEn: string | null; imageUrl: string | null; quantity: number }> }>; total: number; page: number; limit: number }>(
      `/me/orders?page=${page}&limit=20`,
      { token: access, locale },
    );
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
}

import 'server-only';
import type { CalendarPreference, DigitStyle, Locale } from '@hudhud/i18n';
import { ApiError, apiFetch, STOREFRONT_COOKIES } from '@hudhud/web-core';
import { cookies } from 'next/headers';
import { cache } from 'react';

export const PREF_COOKIES = { digits: 'hd_digits', calendar: 'hd_cal' } as const;

export interface DisplayPrefs {
  digits: DigitStyle;
  calendar: CalendarPreference;
}

export async function getDisplayPrefs(): Promise<DisplayPrefs> {
  const jar = await cookies();
  const digits = jar.get(PREF_COOKIES.digits)?.value;
  const calendar = jar.get(PREF_COOKIES.calendar)?.value;
  return {
    digits: digits === 'arabic_indic' ? 'arabic_indic' : 'western',
    calendar: calendar === 'islamic_umalqura' ? 'islamic_umalqura' : 'gregory',
  };
}

export interface StoreInfo {
  name: { ar: string; en: string };
  legal: { commercialRegistration: string; vatNumber: string; legalNameAr: string; legalNameEn: string };
  contact: { phone: string; whatsapp: string; email: string };
  vat: { rateBp: number; pricesIncludeVat: boolean };
  modules: Record<string, boolean>;
}

/** Store identity changes rarely: cache for five minutes across requests. */
export const getStoreInfo = cache(async (): Promise<StoreInfo | null> => {
  try {
    return await apiFetch<StoreInfo>('/store/info', { revalidate: 300, tags: ['store-info'] });
  } catch {
    return null; // the shop still renders if the API is briefly unavailable
  }
});

export interface CurrentUser {
  id: string;
  kind: 'CUSTOMER' | 'STAFF';
  phoneE164: string | null;
  email: string | null;
  fullName: string | null;
  locale: Locale;
  digits: DigitStyle;
  calendar: CalendarPreference;
  createdAt: string;
}

/** The signed-in customer, or null. Middleware has already refreshed expired access tokens. */
export const getCurrentUser = cache(async (locale: Locale): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(STOREFRONT_COOKIES.access)?.value;
  if (!token) return null;
  try {
    return await apiFetch<CurrentUser>('/me', { token, locale });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
});

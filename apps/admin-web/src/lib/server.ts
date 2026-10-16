import 'server-only';
import type { Locale } from '@hudhud/i18n';
import { ADMIN_COOKIES, ApiError, apiFetch, type ApiRequest } from '@hudhud/web-core';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { redirect } from '@/i18n/navigation';

export interface AdminMe {
  id: string;
  email: string | null;
  fullName: string | null;
  locale: Locale;
  roles: string[];
  roleNames: Array<{ key: string; nameAr: string; nameEn: string }>;
  permissions: string[];
}

async function accessToken(): Promise<string | undefined> {
  return (await cookies()).get(ADMIN_COOKIES.access)?.value;
}

/** The signed-in staff member (2FA completed), or null. */
export const getAdmin = cache(async (locale: Locale): Promise<AdminMe | null> => {
  const token = await accessToken();
  if (!token) return null;
  try {
    return await apiFetch<AdminMe>('/admin/me', { token, locale });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
});

export async function requireAdmin(locale: Locale): Promise<AdminMe> {
  const me = await getAdmin(locale);
  if (!me) redirect({ href: '/login', locale });
  return me!;
}

/** Authenticated server-side API call for dashboard pages. */
export async function adminApi<T>(path: string, locale: Locale, init: Omit<ApiRequest, 'token' | 'locale'> = {}): Promise<T> {
  return apiFetch<T>(path, { ...init, token: await accessToken(), locale });
}

export function can(me: AdminMe, permission: string): boolean {
  return me.permissions.includes(permission);
}

/** Field-app API call (`/technician/*`) for the signed-in technician. */
export async function technicianApi<T>(path: string, locale: Locale): Promise<T> {
  return apiFetch<T>(path, { token: await accessToken(), locale });
}

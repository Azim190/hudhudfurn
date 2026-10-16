'use client';

/** Browser-side calls to the admin BFF. Errors carry the API's localized message. */
export class AdminRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as T & { message?: string; code?: string; details?: Record<string, unknown> };
  if (!res.ok) throw new AdminRequestError(json.message ?? res.statusText, res.status, json.code, json.details);
  return json;
}

export function adminCall<T>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET', body?: unknown, locale?: string): Promise<T> {
  return fetch(`/bff/admin${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(locale ? { 'X-HD-Locale': locale } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => (r.status === 204 ? (undefined as T) : parse<T>(r)));
}

export function adminUpload<T>(path: 'media' | 'products/import', form: FormData, locale?: string): Promise<T> {
  return fetch(`/bff/files/${path}`, { method: 'POST', body: form, headers: locale ? { 'X-HD-Locale': locale } : {} }).then((r) => parse<T>(r));
}

/** "149.5" / "١٤٩٫٥" → 14950 halalas; empty → null. */
export function sarToHalalas(input: string): number | null {
  const latin = input.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/٫/g, '.').replace(/[,\s]/g, '');
  if (!latin) return null;
  const n = Number(latin);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function halalasToSar(halalas: number | null | undefined): string {
  if (halalas === null || halalas === undefined) return '';
  return (halalas / 100).toFixed(2).replace(/\.00$/, '');
}

/** Field-app calls (`/api/v1/technician/*`) for staff with the technician role. */
export function technicianCall<T>(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown, locale?: string): Promise<T> {
  return fetch(`/bff/technician${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(locale ? { 'X-HD-Locale': locale } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => parse<T>(r));
}

/** Upload a field photo (re-encoded and stored privately by the API). */
export function technicianUpload(file: File, locale?: string): Promise<{ id: string }> {
  const form = new FormData();
  form.append('file', file);
  return fetch('/bff/files/technician/uploads', { method: 'POST', body: form, headers: locale ? { 'X-HD-Locale': locale } : {} }).then((r) => parse<{ id: string }>(r));
}

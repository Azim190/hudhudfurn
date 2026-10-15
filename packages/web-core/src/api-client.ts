/** Server-side client for the HUDHUD API. Never import this into client components. */

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message || `API error ${status}`);
    this.name = 'ApiError';
  }

  get code(): string {
    return this.body.code;
  }
}

export function apiBaseUrl(): string {
  return (process.env.API_INTERNAL_URL ?? 'http://localhost:4100/api/v1').replace(/\/$/, '');
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  locale?: string;
  /** Forwarded so the API rate-limits and audits the real client, not the web server. */
  clientIp?: string | null;
  userAgent?: string | null;
  /** Next.js fetch cache controls for public data. */
  revalidate?: number | false;
  tags?: string[];
  /** Extra request headers (e.g. X-Cart-Token). */
  headers?: Record<string, string>;
}

export async function apiFetch<T>(path: string, req: ApiRequest = {}): Promise<T> {
  return (await apiFetchWithStatus<T>(path, req)).data;
}

/** Like apiFetch, but also returns the upstream status (e.g. 201) so proxies can preserve it. */
export async function apiFetchWithStatus<T>(path: string, req: ApiRequest = {}): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = { Accept: 'application/json', ...req.headers };
  if (req.body !== undefined) headers['Content-Type'] = 'application/json';
  if (req.token) headers.Authorization = `Bearer ${req.token}`;
  if (req.locale) headers['Accept-Language'] = req.locale;
  if (req.clientIp) headers['X-Forwarded-For'] = req.clientIp;
  if (req.userAgent) headers['User-Agent'] = req.userAgent;

  const authenticated = Boolean(req.token);
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: req.method ?? 'GET',
    headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
    // Personalised responses must never be cached and shared.
    ...(authenticated || req.revalidate === undefined
      ? { cache: 'no-store' as const }
      : { next: { revalidate: req.revalidate, tags: req.tags } }),
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 204) return { status: 204, data: undefined as T };
  const text = await res.text();
  const json: unknown = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const body = (json && typeof json === 'object' ? json : {}) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, {
      statusCode: res.status,
      code: body.code ?? 'generic',
      message: body.message ?? res.statusText,
      details: body.details,
    });
  }
  return { status: res.status, data: json as T };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

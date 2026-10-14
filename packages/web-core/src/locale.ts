import { NextRequest } from 'next/server';

/**
 * Arabic is the default for first-time visitors whatever their browser language (many Saudi
 * customers use English-language devices). A locale chosen with the language switcher is
 * persisted in the NEXT_LOCALE cookie and still wins. We hide Accept-Language from the
 * locale middleware so it falls back to the default locale.
 */
export function withoutBrowserLanguage(req: NextRequest): NextRequest {
  if (!req.headers.has('accept-language')) return req;
  const headers = new Headers(req.headers);
  headers.delete('accept-language');
  return new NextRequest(req, { headers });
}

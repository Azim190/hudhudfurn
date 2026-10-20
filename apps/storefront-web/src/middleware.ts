import { refreshOnNavigation, STOREFRONT_COOKIES, withoutBrowserLanguage } from '@hudhud/web-core';
import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intl = createIntlMiddleware(routing);

export default async function middleware(req: NextRequest) {
  // Rotate an expired access token before rendering (ADR-0002), then apply locale routing.
  const refreshed = await refreshOnNavigation(req, STOREFRONT_COOKIES, (url) => NextResponse.redirect(url));
  return refreshed ?? intl(withoutBrowserLanguage(req));
}

export const config = {
  // Everything except BFF routes, Next internals and static files.
  matcher: ['/((?!bff|admin|_next|_vercel|.*\\..*).*)'],
};

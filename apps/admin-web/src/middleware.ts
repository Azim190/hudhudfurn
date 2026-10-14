import { ADMIN_COOKIES, refreshOnNavigation, withoutBrowserLanguage } from '@hudhud/web-core';
import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intl = createIntlMiddleware(routing);

export default async function middleware(req: NextRequest) {
  const refreshed = await refreshOnNavigation(req, ADMIN_COOKIES, (url) => NextResponse.redirect(url));
  return refreshed ?? intl(withoutBrowserLanguage(req));
}

export const config = {
  matcher: ['/((?!bff|_next|_vercel|.*\\..*).*)'],
};

import { directionOf, isLocale, LOCALES } from '@hudhud/i18n';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getStoreInfo } from '@/lib/server';
import { localizedAlternates, siteUrl } from '@/lib/seo';
import '../globals.css';

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});
const latin = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-latin',
  display: 'swap',
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'common' });
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: `${t('storeName')} | ${t('tagline')}`, template: `%s | ${t('storeName')}` },
    description: t('tagline'),
    alternates: localizedAlternates(locale, '/'),
    openGraph: { siteName: t('storeName'), locale: locale === 'ar' ? 'ar_SA' : 'en_SA', type: 'website' },
  };
}

export const viewport: Viewport = { themeColor: '#2f6f6a', width: 'device-width', initialScale: 1 };

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  // No cookies are read here: the layout must stay cacheable for ISR catalog pages.
  const [t, store] = await Promise.all([getTranslations('common'), getStoreInfo()]);

  return (
    <html lang={locale} dir={directionOf(locale)} className={`${arabic.variable} ${latin.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter locale={locale} store={store} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

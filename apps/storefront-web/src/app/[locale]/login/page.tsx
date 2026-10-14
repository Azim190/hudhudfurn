import { isLocale } from '@hudhud/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/server';
import { localizedAlternates } from '@/lib/seo';
import { OtpLoginForm } from './otp-login-form';

/** Reads the session cookie: always rendered per request, never cached. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('otpTitle'), alternates: localizedAlternates(locale, '/login'), robots: { index: false } };
}

/** Only same-site relative paths are accepted as post-login destinations (no open redirects). */
function safeNext(value: string | undefined): string {
  return value && /^\/(?!\/)[\w\-/?=&%.]*$/.test(value) ? value : '/account';
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser(locale)) redirect({ href: next, locale });

  const t = await getTranslations('auth');
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-20">
      <h1 className="text-3xl font-bold">{t('otpTitle')}</h1>
      <p className="mt-2 text-ink-700">{t('otpSubtitle')}</p>
      <OtpLoginForm next={next} />
    </div>
  );
}

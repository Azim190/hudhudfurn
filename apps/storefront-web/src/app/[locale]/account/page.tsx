import { formatDate, isLocale } from '@hudhud/i18n';
import { Card, ChevronForward } from '@hudhud/ui';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { getCurrentUser, getDisplayPrefs } from '@/lib/server';
import { AccountForm } from './account-form';
import { LogoutButton } from './logout-button';

/** Reads the session cookie: always rendered per request, never cached. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'account' });
  return { title: t('title'), robots: { index: false } };
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);

  const user = await getCurrentUser(locale);
  if (!user) redirect({ href: '/login?next=/account', locale });
  const [t, prefs] = await Promise.all([getTranslations(), getDisplayPrefs()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('account.title')}</h1>
          <p className="mt-1 text-sm text-ink-500">
            <span className="ltr-nums">{user!.phoneE164}</span>
            {' · '}
            {formatDate(user!.createdAt, { locale, digits: prefs.digits, calendar: prefs.calendar })}
          </p>
        </div>
        <LogoutButton />
      </div>
      <Link href="/account/orders" className="mt-8 flex items-center justify-between rounded-card bg-white p-5 font-medium shadow-card hover:text-brand-700">
        {t('account.orders')}
        <ChevronForward />
      </Link>
      <Link href="/account/bookings" className="mt-3 flex items-center justify-between rounded-card bg-white p-5 font-medium shadow-card hover:text-brand-700">
        {t('services.myBookings')}
        <ChevronForward />
      </Link>
      <Link href="/account/measurements" className="mt-3 flex items-center justify-between rounded-card bg-white p-5 font-medium shadow-card hover:text-brand-700">
        {t('configurator.savedProfiles')}
        <ChevronForward />
      </Link>
      <Card className="mt-6 p-6">
        <AccountForm user={user!} />
      </Card>
    </div>
  );
}

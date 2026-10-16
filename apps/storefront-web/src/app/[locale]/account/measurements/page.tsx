import { isLocale } from '@hudhud/i18n';
import { apiFetch, STOREFRONT_COOKIES } from '@hudhud/web-core';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { redirect } from '@/i18n/navigation';
import { MeasurementList, type Profile } from './measurement-list';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: (await getTranslations({ locale, namespace: 'configurator' }))('savedProfiles'), robots: { index: false } };
}

export default async function MeasurementsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const token = (await cookies()).get(STOREFRONT_COOKIES.access)?.value;
  const profiles = token ? await apiFetch<Profile[]>('/me/measurement-profiles', { token, locale }).catch(() => null) : null;
  if (!profiles) redirect({ href: '/login?next=/account/measurements', locale });
  const t = await getTranslations('configurator');
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">{t('savedProfiles')}</h1>
      <MeasurementList initial={profiles!} />
    </div>
  );
}

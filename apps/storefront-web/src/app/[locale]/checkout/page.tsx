import { isLocale } from '@hudhud/i18n';
import { apiFetch, STOREFRONT_COOKIES } from '@hudhud/web-core';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/server';
import { CheckoutView, type CheckoutCity, type PickupLocation, type SavedAddress } from './checkout-view';

/** Personalised (session, cart): never cached. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: (await getTranslations({ locale, namespace: 'checkout' }))('title'), robots: { index: false } };
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('checkout');
  const user = await getCurrentUser(locale);
  const access = (await cookies()).get(STOREFRONT_COOKIES.access)?.value;
  const [cities, pickupLocations, addresses] = await Promise.all([
    apiFetch<CheckoutCity[]>('/geo/cities', { revalidate: 3600 }).catch(() => []),
    apiFetch<PickupLocation[]>('/checkout/pickup-locations', { revalidate: 300 }).catch(() => []),
    user && access ? apiFetch<SavedAddress[]>('/me/addresses', { token: access, locale }).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-sm text-ink-500">🔒 {t('secureCheckout')}</p>
      </div>
      <CheckoutView
        cities={cities}
        pickupLocations={pickupLocations}
        addresses={addresses}
        user={user ? { fullName: user.fullName, phoneE164: user.phoneE164, email: user.email } : null}
      />
    </div>
  );
}

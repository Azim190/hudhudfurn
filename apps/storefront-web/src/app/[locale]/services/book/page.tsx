import { isLocale } from '@hudhud/i18n';
import { apiFetch, STOREFRONT_COOKIES } from '@hudhud/web-core';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { CheckoutCity, SavedAddress } from '../../checkout/checkout-view';
import { getCurrentUser } from '@/lib/server';
import { BookingForm } from './booking-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'services' });
  return { title: t('bookTitle'), description: t('bookIntro') };
}

export default async function BookVisitPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ type?: string; order?: string; product?: string }> }) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('services');
  const user = await getCurrentUser(locale);
  const access = (await cookies()).get(STOREFRONT_COOKIES.access)?.value;
  const [cities, addresses] = await Promise.all([
    apiFetch<CheckoutCity[]>('/geo/cities', { revalidate: 3600 }).catch(() => []),
    user && access ? apiFetch<SavedAddress[]>('/me/addresses', { token: access, locale }).catch(() => []) : Promise.resolve([]),
  ]);
  const uuid = /^[0-9a-f-]{36}$/;
  const type = sp.type === 'INSTALLATION' && sp.order && uuid.test(sp.order) ? 'INSTALLATION' : 'MEASUREMENT';

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">{type === 'INSTALLATION' ? t('installTitle') : t('bookTitle')}</h1>
      <p className="mt-2 text-ink-700">{type === 'INSTALLATION' ? t('installIntro') : t('bookIntro')}</p>
      <BookingForm
        type={type}
        orderId={type === 'INSTALLATION' ? sp.order : undefined}
        productId={sp.product && uuid.test(sp.product) ? sp.product : undefined}
        cities={cities}
        addresses={addresses}
        user={user ? { fullName: user.fullName, phoneE164: user.phoneE164 } : null}
      />
    </div>
  );
}

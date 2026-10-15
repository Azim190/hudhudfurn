import { isLocale } from '@hudhud/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/order-access';
import { PaymentReturn } from './payment-return';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: (await getTranslations({ locale, namespace: 'checkout' }))('returnTitle'), robots: { index: false } };
}

/** Where payment pages send the customer back. The payment is verified server-side, never trusted from the URL. */
export default async function PaymentReturnPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ order?: string }> }) {
  const [{ locale }, { order }] = await Promise.all([params, searchParams]);
  if (!isLocale(locale) || !order || !isUuid(order)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('checkout');
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold">{t('returnTitle')}</h1>
      <PaymentReturn orderId={order} />
    </div>
  );
}

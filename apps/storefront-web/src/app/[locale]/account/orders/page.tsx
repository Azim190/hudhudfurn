import { formatDate, formatPrice, isLocale } from '@hudhud/i18n';
import { Badge, Card } from '@hudhud/ui';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { pick } from '@/lib/catalog-types';
import { getMyOrders } from '@/lib/orders';
import { getDisplayPrefs } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: (await getTranslations({ locale, namespace: 'orders' }))('title'), robots: { index: false } };
}

export default async function MyOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const orders = await getMyOrders(locale);
  if (!orders) redirect({ href: '/login?next=/account/orders', locale });
  const [t, prefs] = await Promise.all([getTranslations('orders'), getDisplayPrefs()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      {orders!.items.length === 0 ? (
        <Card className="mt-8 p-10 text-center text-ink-500">{t('empty')}</Card>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {orders!.items.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="block rounded-card bg-white p-5 shadow-card transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-semibold">{t('orderNumber', { number: o.number })}</span>
                  <Badge>{t(`status_${o.status}` as 'status_NEW')}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-500">{t('placedOn', { date: formatDate(o.placedAt, { locale, digits: prefs.digits, calendar: prefs.calendar }) })}</p>
                <div className="mt-3 flex items-center gap-2">
                  {o.preview.map((p, i) =>
                    p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- thumbnail rendition
                      <img key={i} src={p.imageUrl} alt={pick(locale, p.nameAr, p.nameEn)} width={40} height={50} className="h-12.5 w-10 rounded object-cover" />
                    ) : (
                      <span key={i} className="block h-12.5 w-10 rounded bg-sand-100" />
                    ),
                  )}
                  {o.itemCount > o.preview.length && <span className="text-xs text-ink-500">{t('moreItems', { count: o.itemCount - o.preview.length })}</span>}
                  <span className="ms-auto font-semibold">{formatPrice(o.total, { locale, digits: prefs.digits })}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

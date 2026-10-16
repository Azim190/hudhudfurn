import { formatDate, formatPrice, isLocale } from '@hudhud/i18n';
import { Alert, Badge, Card } from '@hudhud/ui';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ConfigurationSummary } from '@/components/configuration-summary';
import { Link, redirect } from '@/i18n/navigation';
import { pick } from '@/lib/catalog-types';
import { getCurrentUser } from '@/lib/server';
import { getQuotation } from '@/lib/services';
import { AcceptQuotation } from './accept-quotation';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: (await getTranslations({ locale, namespace: 'services' }))('quotations'), robots: { index: false } };
}

export default async function QuotationPage({ params }: { params: Promise<{ locale: string; number: string }> }) {
  const { locale, number } = await params;
  if (!isLocale(locale) || !/^QT-\d{4}-\d{6}$/.test(number)) notFound();
  setRequestLocale(locale);
  if (!(await getCurrentUser(locale))) redirect({ href: `/login?next=/quotations/${number}`, locale });
  const q = await getQuotation(number, locale);
  if (!q) notFound();
  const [t, tc] = await Promise.all([getTranslations('services'), getTranslations('checkout')]);
  const money = (h: number) => formatPrice(h, { locale, digits: 'western' });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('quotationNumber', { number: q.number })}</h1>
        <Badge>{t(`quotation_${q.status}` as 'quotation_SENT')}</Badge>
      </div>
      <p className="mt-1 text-sm text-ink-500">{t('validUntil', { date: formatDate(q.validUntil, { locale, digits: 'western' }) })}</p>

      <Card className="mt-6 p-5">
        <ul className="flex flex-col divide-y divide-sand-200">
          {q.lines.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{pick(locale, l.nameAr, l.nameEn)}</p>
                <ConfigurationSummary configuration={l.configuration} className="text-xs text-ink-500" />
                {l.quantity > 1 && <p className="text-xs text-ink-500">{money(l.unitPrice)} × {l.quantity}</p>}
              </div>
              <span className="shrink-0 font-semibold">{money(l.total)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 flex flex-col gap-1 border-t border-sand-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt>{tc('subtotal')}</dt>
            <dd>{money(q.subtotal)}</dd>
          </div>
          {q.credit > 0 && (
            <div className="flex justify-between text-success-600">
              <dt>{t('visitCredit')}</dt>
              <dd>−{money(q.credit)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <dt>{tc('total')}</dt>
            <dd data-testid="quotation-total">{money(q.total)}</dd>
          </div>
          <p className="text-xs text-ink-500">{t('quotationIncludes')}</p>
        </dl>
        {q.notes && <p className="mt-3 text-sm text-ink-700" dir="auto">{q.notes}</p>}
      </Card>

      {q.status === 'SENT' && <AcceptQuotation number={q.number} methods={q.paymentMethods} />}
      {q.status === 'ACCEPTED' && q.orderId && (
        <Alert tone="success" className="mt-6">
          {t('quotationAccepted')}{' '}
          <Link href={`/orders/${q.orderId}`} className="font-medium underline">
            {tc('viewOrder')}
          </Link>
        </Alert>
      )}
      {q.status === 'EXPIRED' && <Alert className="mt-6">{t('quotationExpired')}</Alert>}
    </div>
  );
}

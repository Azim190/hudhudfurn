import { formatDate, formatPrice, isLocale, type Locale } from '@hudhud/i18n';
import { Alert, Badge, Card } from '@hudhud/ui';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ConfigurationSummary } from '@/components/configuration-summary';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/catalog-types';
import { isUuid } from '@/lib/order-access';
import { getOrder, type OrderView } from '@/lib/orders';
import { getDisplayPrefs } from '@/lib/server';
import { OrderActions } from './order-actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: (await getTranslations({ locale, namespace: 'orders' }))('title'), robots: { index: false } };
}

/** Isolate left-to-right values (phone numbers) inside translated sentences so RTL text cannot reorder them. */
const ltr = (value: string) => `⁦${value}⁩`;
const name = (locale: Locale, ar: string, en: string | null | undefined) => pick(locale, ar, en ?? null);

export default async function OrderPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const [{ locale, id }, { placed }] = await Promise.all([params, searchParams]);
  if (!isLocale(locale) || !isUuid(id)) notFound();
  setRequestLocale(locale);
  const order = await getOrder(id, locale);
  if (!order) notFound();
  const [t, tc, ts, prefs] = await Promise.all([getTranslations('orders'), getTranslations('checkout'), getTranslations('services'), getDisplayPrefs()]);
  const money = (h: number) => formatPrice(h, { locale, digits: prefs.digits });
  const date = (iso: string) => formatDate(iso, { locale, digits: prefs.digits, calendar: prefs.calendar }, { dateStyle: 'medium', timeStyle: 'short' });
  const justPlaced = placed === '1' && order.status !== 'CANCELLED';

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {justPlaced && (
        <Alert tone="success" className="mb-6">
          <p className="font-semibold">{t('thanks')}</p>
          {order.shippingAddress && <p className="mt-1">{t('thanksHint', { phone: ltr(order.shippingAddress.phoneE164) })}</p>}
        </Alert>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="order-number">
            {t('orderNumber', { number: order.number })}
          </h1>
          <p className="mt-1 text-sm text-ink-500">{t('placedOn', { date: date(order.placedAt) })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{t(`status_${order.status}` as 'status_NEW')}</Badge>
          <Badge className="bg-sand-100 text-ink-700">{t(`payment_${order.paymentState}` as 'payment_PAID')}</Badge>
        </div>
      </div>

      {order.status === 'CANCELLED' && <Alert className="mt-6">{t('cancelled')}</Alert>}
      {order.canRetryPayment && order.expiresAt && <Alert tone="info" className="mt-6">{t('payBefore', { time: date(order.expiresAt) })}</Alert>}
      <OrderActions orderId={order.id} canRetryPayment={order.canRetryPayment} canCancel={order.canCancel} />
      {order.booking && (
        <Alert tone="info" className="mt-6">
          <Link href={`/account/bookings/${order.booking.id}`} className="font-medium underline">
            {ts('visitBookingLink', { number: order.booking.number })}
          </Link>
        </Alert>
      )}
      {order.installationBookings.map((b) => (
        <Alert key={b.id} tone="info" className="mt-6">
          <Link href={`/account/bookings/${b.id}`} className="font-medium underline">
            {ts('installationBookingLink', { number: b.number })}
          </Link>
        </Alert>
      ))}
      {order.canBookInstallation && (
        <Link href={`/services/book?type=INSTALLATION&order=${order.id}`} className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand-600 px-5 font-medium text-white hover:bg-brand-700">
          {ts('scheduleInstallation')}
        </Link>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <h2 className="text-lg font-semibold">{t('items')}</h2>
          <ul className="mt-4 flex flex-col divide-y divide-sand-200">
            {order.items.map((i) => (
              <li key={i.id} className="flex gap-4 py-3">
                <span className="shrink-0 overflow-hidden rounded-md bg-sand-100">
                  {i.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- thumbnail rendition
                    <img src={i.imageUrl} alt="" width={64} height={80} className="h-20 w-16 object-cover" />
                  ) : (
                    <span className="block h-20 w-16" />
                  )}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{name(locale, i.nameAr, i.nameEn)}</p>
                  <p className="text-ink-500">
                    {[
                      ...i.options.map((o) => name(locale, o.labelAr, o.labelEn)),
                      i.widthMm && i.heightMm ? `${i.widthMm / 10} × ${i.heightMm / 10} cm` : null,
                      i.lengthCm ? `${i.lengthCm} cm` : null,
                      t('qty', { count: i.quantity }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {i.configuration && <ConfigurationSummary configuration={i.configuration} className="text-xs text-ink-500" />}
                  {i.giftMessage && <p className="text-xs text-ink-500">{t('giftMessage', { message: i.giftMessage })}</p>}
                </div>
                <span className="shrink-0 text-sm font-semibold">{money(i.total)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="p-5 text-sm">
            <h2 className="text-lg font-semibold">{tc('summary')}</h2>
            <dl className="mt-3 flex flex-col gap-2">
              <Row label={tc('subtotal')} value={money(order.totals.subtotal)} />
              {order.totals.discount > 0 && <Row label={tc('discount')} value={`−${money(order.totals.discount)}`} />}
              {order.totals.giftWrap > 0 && <Row label={tc('giftWrap')} value={money(order.totals.giftWrap)} />}
              {order.fulfillment === 'DELIVERY' && <Row label={tc('shipping')} value={order.totals.shipping ? money(order.totals.shipping) : tc('free')} />}
              {order.totals.codFee > 0 && <Row label={tc('codFeeLine')} value={money(order.totals.codFee)} />}
              <div className="flex justify-between border-t border-sand-200 pt-2 text-base font-semibold">
                <dt>{tc('total')}</dt>
                <dd>{money(order.totals.total)}</dd>
              </div>
              <Row label={tc('vatIncluded', { rate: order.vatRateBp / 100 })} value={money(order.totals.vat)} muted />
              {order.totals.refunded > 0 && <Row label={t('refunded', { amount: money(order.totals.refunded) })} value="" />}
            </dl>
            <p className="mt-3 text-ink-500">
              {t('paymentMethod')}: {tc(`method_${order.paymentMethod}` as 'method_CARD')}
              {order.payment?.sourceSummary ? ` (${order.payment.sourceSummary})` : ''}
            </p>
          </Card>

          <DeliveryCard order={order} locale={locale} t={t} />

          {order.invoices.length > 0 && (
            <Card className="p-5 text-sm">
              <h2 className="text-lg font-semibold">{t('invoices')}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {order.invoices.map((inv) => (
                  <li key={inv.id}>
                    <Link href={`/orders/${order.id}/invoices/${inv.id}`} className="text-brand-700 hover:underline">
                      {inv.kind === 'INVOICE' ? t('invoice') : t('creditNote')} · <span dir="ltr">{inv.number}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5 text-sm">
            <h2 className="text-lg font-semibold">{t('timeline')}</h2>
            <ol className="mt-3 flex flex-col gap-2 border-s border-sand-300 ps-4">
              {order.timeline.map((e, idx) => (
                <li key={idx}>
                  <p className="font-medium">{t(`status_${e.status}` as 'status_NEW')}</p>
                  <p className="text-xs text-ink-500">{date(e.at)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DeliveryCard({ order, locale, t }: { order: OrderView; locale: Locale; t: Awaited<ReturnType<typeof getTranslations<'orders'>>> }) {
  const a = order.shippingAddress;
  return (
    <Card className="p-5 text-sm">
      <h2 className="text-lg font-semibold">{order.fulfillment === 'PICKUP' ? t('pickupFrom') : t('deliveryTo')}</h2>
      {a && (
        <address className="mt-2 not-italic text-ink-700">
          <p>{a.recipientName}</p>
          <p>{[a.buildingNo, a.street, locale === 'en' ? (a.districtEn ?? a.district) : a.district, locale === 'en' ? a.cityNameEn : a.cityNameAr, a.postalCode].filter(Boolean).join('، ')}</p>
          <p dir="ltr" className="text-end">
            {a.phoneE164}
          </p>
        </address>
      )}
      {order.pickupLocation && <p className="mt-2">{pick(locale, order.pickupLocation.nameAr, order.pickupLocation.nameEn)}</p>}
      {order.shipping && <p className="mt-2 text-ink-500">{pick(locale, order.shipping.nameAr ?? '', order.shipping.nameEn)}</p>}
      {order.eta && order.status !== 'CANCELLED' && <p className="mt-1 text-ink-500">{t('eta', { min: order.eta.minDays, max: order.eta.maxDays })}</p>}
    </Card>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={muted ? 'flex justify-between text-xs text-ink-500' : 'flex justify-between'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

import { allowedTransitions, type OrderStatus } from '@hudhud/domain';
import { formatDate, formatPrice, isLocale } from '@hudhud/i18n';
import { Alert, Badge, Card } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { adminApi, can, requireAdmin } from '@/lib/server';
import { OrderOperations } from './order-operations';
import { withBase } from '@/lib/base-path';

interface AdminOrder {
  id: string;
  number: string;
  status: OrderStatus;
  paymentMethod: string;
  paymentState: string;
  fulfillment: 'DELIVERY' | 'PICKUP';
  placedAt: string;
  contact: { name: string; phoneE164: string; email: string | null };
  customerNote: string | null;
  shippingAddress: { recipientName: string; phoneE164: string; cityNameAr: string; cityNameEn: string; district: string | null; street: string | null; buildingNo: string | null; postalCode: string | null; shortAddress: string | null } | null;
  pickupLocation: { nameAr: string; nameEn: string | null } | null;
  shipping: { nameAr: string | null; nameEn: string | null; carrier: string | null } | null;
  items: Array<{ id: string; sku: string; nameAr: string; nameEn: string | null; quantity: number; unitPrice: number; discount: number; total: number; isSample: boolean; isMadeToMeasure: boolean; widthMm: number | null; heightMm: number | null; lengthCm: number | null; options: Array<{ labelAr: string; labelEn: string | null }>; giftWrap: boolean; giftMessage: string | null; configuration: WorkshopSpec | null }>;
  totals: { subtotal: number; discount: number; giftWrap: number; shipping: number; codFee: number; vat: number; total: number; refunded: number };
  couponCode: string | null;
  events: Array<{ id: string; fromStatus: string | null; toStatus: string; note: string | null; actorId: string | null; createdAt: string }>;
  payments: Array<{ id: string; provider: string; method: string; status: string; amount: number; providerRef: string | null; sourceSummary: string | null; failureReason: string | null; createdAt: string }>;
  refunds: Array<{ id: string; amount: number; status: string; reason: string; createdAt: string }>;
  invoices: Array<{ id: string; kind: string; number: string; issuedAt: string; total: number; zatcaStatus: string }>;
}

interface WorkshopSpec {
  templateCode: string;
  kind: string;
  templateVersion: number;
  inputs: { photoIds?: string[]; pieces?: unknown[] };
  specs: Record<string, number | string>;
  choices?: Array<{ group: string; code: string; nameAr: string; nameEn: string }>;
}

export default async function AdminOrderPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireAdmin(locale);
  const [t, to, tc] = await Promise.all([getTranslations('admin'), getTranslations('orders'), getTranslations('checkout')]);
  if (!can(me, 'orders.read')) return <Alert>{t('noAccess')}</Alert>;
  const order = await adminApi<AdminOrder>(`/admin/orders/${id}`, locale).catch(() => null);
  if (!order) notFound();

  const money = (h: number) => formatPrice(h, { locale, digits: 'western' });
  const when = (iso: string) => formatDate(iso, { locale, digits: 'western' }, { dateStyle: 'medium', timeStyle: 'short' });
  const name = (ar: string, en: string | null | undefined) => (locale === 'en' && en ? en : ar);
  const nextStatuses = allowedTransitions(order.status).filter((s) => s !== 'CANCELLED' && s !== 'PAID' && s !== 'CONFIRMED');
  const a = order.shippingAddress;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/orders" className="text-sm text-brand-700 hover:underline">
        {t('orderList')}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold" dir="ltr">
          {order.number}
        </h1>
        <Badge>{to(`status_${order.status}` as 'status_NEW')}</Badge>
        <Badge className="bg-sand-100">{to(`payment_${order.paymentState}` as 'payment_PAID')}</Badge>
        <span className="text-sm text-ink-500">{when(order.placedAt)}</span>
      </div>

      <OrderOperations
        orderId={order.id}
        nextStatuses={nextStatuses.map((s) => ({ status: s, label: t('moveTo', { status: to(`status_${s}`) }) }))}
        canUpdate={can(me, 'orders.update')}
        canCancel={can(me, 'orders.cancel') && can(me, 'orders.refund') && allowedTransitions(order.status).includes('CANCELLED')}
        canSync={can(me, 'orders.update') && order.paymentMethod !== 'COD' && order.paymentState === 'UNPAID'}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          <Card className="overflow-x-auto">
            <h2 className="px-5 pt-5 text-lg font-semibold">{t('items')}</h2>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {order.items.map((i) => (
                  <tr key={i.id} className="border-t border-sand-100">
                    <td className="px-5 py-3">
                      <p className="font-medium">{name(i.nameAr, i.nameEn)}</p>
                      <p className="text-xs text-ink-500">
                        <span dir="ltr">{i.sku}</span>
                        {[...i.options.map((o) => name(o.labelAr, o.labelEn)), i.widthMm && i.heightMm ? `${i.widthMm} × ${i.heightMm} mm` : null, i.lengthCm ? `${i.lengthCm} cm` : null, i.isSample ? 'sample' : null, i.giftWrap ? `🎁 ${i.giftMessage ?? ''}` : null]
                          .filter(Boolean)
                          .map((x) => ` · ${x}`)
                          .join('')}
                      </p>
                      {i.configuration && <WorkshopSpecView spec={i.configuration} title={t('workshopSpec')} photosTitle={t('customerPhotos')} locale={locale} />}
                    </td>
                    <td className="px-3 py-3 text-center">× {i.quantity}</td>
                    <td className="px-5 py-3 text-end font-semibold whitespace-nowrap">{money(i.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="flex flex-col gap-1 border-t border-sand-200 px-5 py-4 text-sm">
              <Row label={tc('subtotal')} value={money(order.totals.subtotal)} />
              {order.totals.discount > 0 && <Row label={`${tc('discount')}${order.couponCode ? ` (${order.couponCode})` : ''}`} value={`−${money(order.totals.discount)}`} />}
              {order.totals.giftWrap > 0 && <Row label={tc('giftWrap')} value={money(order.totals.giftWrap)} />}
              {order.fulfillment === 'DELIVERY' && <Row label={tc('shipping')} value={money(order.totals.shipping)} />}
              {order.totals.codFee > 0 && <Row label={tc('codFeeLine')} value={money(order.totals.codFee)} />}
              <Row label={tc('total')} value={money(order.totals.total)} strong />
              <Row label={tc('vatIncluded', { rate: 15 })} value={money(order.totals.vat)} />
              {order.totals.refunded > 0 && <Row label={t('refunds')} value={`−${money(order.totals.refunded)}`} />}
            </dl>
          </Card>

          <Card className="overflow-x-auto p-5">
            <h2 className="text-lg font-semibold">{t('payments')}</h2>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {order.payments.map((p) => (
                  <tr key={p.id} className="border-t border-sand-100">
                    <td className="py-2">{p.provider}</td>
                    <td className="py-2">{p.status}</td>
                    <td className="py-2 font-mono text-xs" dir="ltr">
                      <span className="block text-start">{p.providerRef}</span>
                    </td>
                    <td className="py-2 text-xs text-ink-500">{p.sourceSummary ?? p.failureReason}</td>
                    <td className="py-2 text-end whitespace-nowrap">{money(p.amount)}</td>
                  </tr>
                ))}
                {order.refunds.map((r) => (
                  <tr key={r.id} className="border-t border-sand-100 text-ink-700">
                    <td className="py-2">{t('refunds')}</td>
                    <td className="py-2">{r.status}</td>
                    <td className="py-2 text-xs" colSpan={2}>
                      {r.reason}
                    </td>
                    <td className="py-2 text-end whitespace-nowrap">−{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold">{t('history')}</h2>
            <ol className="mt-3 flex flex-col gap-2 border-s border-sand-300 ps-4 text-sm">
              {order.events.map((e) => (
                <li key={e.id}>
                  <span className="font-medium">{to(`status_${e.toStatus}` as 'status_NEW')}</span> <span className="text-ink-500">· {when(e.createdAt)}</span>
                  {e.note && <p className="text-xs text-ink-500">{e.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="p-5 text-sm">
            <h2 className="text-lg font-semibold">{t('contact')}</h2>
            <p className="mt-2">{order.contact.name}</p>
            <p dir="ltr" className="text-end">
              {order.contact.phoneE164}
            </p>
            {order.contact.email && (
              <p dir="ltr" className="text-end">
                {order.contact.email}
              </p>
            )}
            {order.customerNote && (
              <>
                <h3 className="mt-3 font-semibold">{t('customerNote')}</h3>
                <p dir="auto">{order.customerNote}</p>
              </>
            )}
          </Card>
          <Card className="p-5 text-sm">
            <h2 className="text-lg font-semibold">{order.fulfillment === 'PICKUP' ? t('pickupBranch') : t('deliveryAddress')}</h2>
            {a && (
              <address className="mt-2 not-italic">
                <p>{a.recipientName}</p>
                <p>{[a.buildingNo, a.street, a.district, name(a.cityNameAr, a.cityNameEn), a.postalCode, a.shortAddress].filter(Boolean).join('، ')}</p>
                <p dir="ltr" className="text-end">
                  {a.phoneE164}
                </p>
              </address>
            )}
            {order.pickupLocation && <p className="mt-2">{name(order.pickupLocation.nameAr, order.pickupLocation.nameEn)}</p>}
            {order.shipping && <p className="mt-2 text-ink-500">{name(order.shipping.nameAr ?? '', order.shipping.nameEn)}</p>}
          </Card>
          <Card className="p-5 text-sm">
            <h2 className="text-lg font-semibold">{t('invoices')}</h2>
            {order.invoices.length === 0 ? (
              <p className="mt-2 text-ink-500">—</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {order.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2">
                    <span>
                      <span dir="ltr">{inv.number}</span>
                      <span className="block text-xs text-ink-500">
                        {t('zatcaStatus')}: {inv.zatcaStatus}
                      </span>
                    </span>
                    {can(me, 'invoicing.read') && (
                      <a href={withBase(`/bff/files/invoices/${inv.id}/xml`)} className="text-brand-700 hover:underline">
                        {t('downloadXml')}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between border-t border-sand-200 pt-2 text-base font-semibold' : 'flex justify-between'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Full made-to-measure specification for the workshop: every spec value, the chosen options and the customer's photos. */
function WorkshopSpecView({ spec, title, photosTitle, locale }: { spec: WorkshopSpec; title: string; photosTitle: string; locale: string }) {
  const photos = spec.inputs.photoIds ?? [];
  return (
    <details className="mt-2 rounded-lg bg-sand-100 p-3 text-xs" open>
      <summary className="cursor-pointer font-semibold">
        {title} · {spec.templateCode} v{spec.templateVersion}
      </summary>
      {spec.choices && spec.choices.length > 0 && <p className="mt-2">{spec.choices.map((c) => (locale === 'en' ? c.nameEn : c.nameAr)).join(' · ')}</p>}
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3" dir="ltr">
        {Object.entries(spec.specs).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-sand-200 py-0.5">
            <dt className="text-ink-500">{k}</dt>
            <dd className="font-mono">{String(v)}</dd>
          </div>
        ))}
      </dl>
      {photos.length > 0 && (
        <>
          <p className="mt-3 font-semibold">{photosTitle}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {photos.map((id) => (
              <a key={id} href={withBase(`/bff/files/configurator/uploads/${id}`)} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- private image served through the admin proxy */}
                <img src={withBase(`/bff/files/configurator/uploads/${id}`)} alt="" className="size-20 rounded-md object-cover" />
              </a>
            ))}
          </div>
        </>
      )}
    </details>
  );
}

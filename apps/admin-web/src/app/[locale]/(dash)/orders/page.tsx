import { ORDER_STATUSES } from '@hudhud/domain';
import { formatDate, formatPrice, isLocale } from '@hudhud/i18n';
import { Alert, Badge, Card } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { adminApi, can, requireAdmin } from '@/lib/server';

interface OrderRow {
  id: string;
  number: string;
  status: string;
  paymentMethod: string;
  paymentState: string;
  fulfillment: 'DELIVERY' | 'PICKUP';
  contactName: string;
  contactPhoneE164: string;
  cityCode: string | null;
  total: number;
  placedAt: string;
  _count: { items: number };
}

const PAGE_SIZE = 30;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale: isLocale(locale) ? locale : 'ar', namespace: 'admin' }))('orderList') };
}

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string; q?: string; status?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  const [t, to, tc] = await Promise.all([getTranslations('admin'), getTranslations('orders'), getTranslations('checkout')]);
  if (!can(me, 'orders.read')) return <Alert>{t('noAccess')}</Alert>;

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = ORDER_STATUSES.find((s) => s === sp.status);
  const q = sp.q?.trim().slice(0, 80) ?? '';
  const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), ...(q ? { q } : {}), ...(status ? { status } : {}) });
  const data = await adminApi<{ items: OrderRow[]; total: number }>(`/admin/orders?${qs}`, locale);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const link = (p: number) => `/orders?${new URLSearchParams({ page: String(p), ...(q ? { q } : {}), ...(status ? { status } : {}) })}`;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">{t('orderList')}</h1>
      <form className="mt-6 flex flex-wrap items-end gap-3" role="search">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-ink-700">{t('search')}</span>
          <input name="q" defaultValue={q} placeholder={t('searchOrders')} className="h-11 rounded-xl border border-sand-300 bg-white px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink-700">{t('status')}</span>
          <select name="status" defaultValue={status ?? ''} className="h-11 rounded-xl border border-sand-300 bg-white px-3">
            <option value="">{t('allStatuses')}</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {to(`status_${s}`)}
              </option>
            ))}
          </select>
        </label>
        <button className="h-11 rounded-xl bg-brand-600 px-5 font-medium text-white hover:bg-brand-700">{t('search')}</button>
      </form>

      <Card className="mt-6 overflow-x-auto">
        {data.items.length === 0 ? (
          <p className="p-6 text-sm text-ink-500">{t('noResults')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-sand-200 text-xs text-ink-500">
              <tr>
                {[t('orderNumber'), t('placed'), t('customer'), t('status'), t('payment'), t('fulfillment'), t('total')].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-start font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr key={o.id} className="border-b border-sand-100 last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/orders/${o.id}`} className="text-brand-700 hover:underline" dir="ltr">
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-500">{formatDate(o.placedAt, { locale, digits: 'western' }, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="px-4 py-3">
                    {o.contactName}
                    <span dir="ltr" className="block text-start text-xs text-ink-500">
                      {o.contactPhoneE164}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{to(`status_${o.status}` as 'status_NEW')}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {tc(`method_${o.paymentMethod}` as 'method_CARD').split(' — ')[0]}
                    <span className="block text-xs text-ink-500">{to(`payment_${o.paymentState}` as 'payment_PAID')}</span>
                  </td>
                  <td className="px-4 py-3">{t(`fulfillment_${o.fulfillment}`)}</td>
                  <td className="px-4 py-3 font-semibold whitespace-nowrap">{formatPrice(o.total, { locale, digits: 'western' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="pagination">
          {page > 1 ? <Link href={link(page - 1)}>{t('previous')}</Link> : <span />}
          <span className="text-ink-500">{t('page', { page, pages })}</span>
          {page < pages ? <Link href={link(page + 1)}>{t('next')}</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

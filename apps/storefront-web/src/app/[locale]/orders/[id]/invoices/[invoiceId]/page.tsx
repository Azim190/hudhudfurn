import { formatDate, isLocale, type Locale } from '@hudhud/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { Link } from '@/i18n/navigation';
import { isUuid } from '@/lib/order-access';
import { getInvoice } from '@/lib/orders';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: (await getTranslations({ locale, namespace: 'invoice' }))('title'), robots: { index: false } };
}

/** Plain SAR amounts (two decimals, Western digits) as printed on tax invoices. */
const amount = (halalas: number) => (halalas / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Printable simplified tax invoice / credit note. Arabic is the legally required language and is
 * always shown; English labels are printed beside it. The QR code carries the ZATCA TLV payload.
 */
export default async function InvoicePage({ params }: { params: Promise<{ locale: string; id: string; invoiceId: string }> }) {
  const { locale, id, invoiceId } = await params;
  if (!isLocale(locale) || !isUuid(id) || !isUuid(invoiceId)) notFound();
  setRequestLocale(locale);
  const inv = await getInvoice(id, invoiceId, locale);
  if (!inv) notFound();
  const [ar, en] = await Promise.all([getTranslations({ locale: 'ar', namespace: 'invoice' }), getTranslations({ locale: 'en', namespace: 'invoice' })]);
  const both = (key: Parameters<typeof ar>[0]) => (
    <>
      <span lang="ar">{ar(key)}</span>
      <span lang="en" className="block text-[0.7rem] font-normal text-ink-500">
        {en(key)}
      </span>
    </>
  );
  const qrSvg = await QRCode.toString(inv.qr, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 160 });
  const issued = (l: Locale) => formatDate(inv.issuedAt, { locale: l, digits: 'western' }, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Riyadh' });
  const credit = inv.kind === 'CREDIT_NOTE';
  const sellerAddress = [inv.seller.buildingNumber, inv.seller.street, inv.seller.district, inv.seller.city, inv.seller.postalCode].filter(Boolean).join('، ');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/orders/${id}`} className="text-sm text-brand-700 hover:underline">
          {locale === 'ar' ? ar('back') : en('back')}
        </Link>
        <PrintButton label={locale === 'ar' ? ar('print') : en('print')} />
      </div>

      <article dir="rtl" lang="ar" className="rounded-card bg-white p-6 text-sm shadow-card print:shadow-none" data-testid="invoice">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-sand-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold">{credit ? ar('creditTitle') : ar('title')}</h1>
            <p dir="ltr" className="text-end text-base font-medium text-ink-500">
              {credit ? en('creditTitle') : en('title')}
            </p>
          </div>
          <div className="shrink-0 text-center">
            <div className="size-40" role="img" aria-label={`${ar('qrHint')} / ${en('qrHint')}`} dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p className="mt-1 max-w-40 text-[0.65rem] text-ink-500">{ar('qrHint')}</p>
          </div>
        </header>

        <dl className="grid gap-x-8 gap-y-3 border-b border-sand-200 py-4 sm:grid-cols-2">
          <Item label={both('number')} value={<span dir="ltr">{inv.number}</span>} />
          <Item label={both('issueDate')} value={<>{issued('ar')}<span lang="en" className="block text-xs text-ink-500">{issued('en')}</span></>} />
          <Item label={both('orderNumber')} value={<span dir="ltr">{inv.orderNumber}</span>} />
          {credit && inv.originalNumber && <Item label={both('originalInvoice')} value={<span dir="ltr">{inv.originalNumber}</span>} />}
          {credit && inv.reason && <Item label={both('reason')} value={<span dir="auto">{inv.reason}</span>} />}
        </dl>

        <section className="border-b border-sand-200 py-4">
          <h2 className="font-semibold">{both('seller')}</h2>
          <p className="mt-2 font-medium">{inv.seller.nameAr}</p>
          <p dir="ltr" className="text-end text-ink-500">
            {inv.seller.nameEn}
          </p>
          <dl className="mt-2 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <Item label={both('vatNumber')} value={<span dir="ltr" data-testid="seller-vat">{inv.seller.vatNumber}</span>} />
            {inv.seller.crn && <Item label={both('crn')} value={<span dir="ltr">{inv.seller.crn}</span>} />}
            {sellerAddress && <Item label={both('address')} value={sellerAddress} />}
          </dl>
        </section>

        <div className="overflow-x-auto py-4">
          <table className="w-full min-w-[640px] border-collapse text-start">
            <thead>
              <tr className="border-b border-sand-300 text-start align-bottom text-xs font-semibold">
                <th className="py-2 pe-3 text-start">{both('description')}</th>
                <th className="px-2 py-2 text-center">{both('qty')}</th>
                <th className="px-2 py-2 text-end">{both('priceExVat')}</th>
                <th className="px-2 py-2 text-end">{both('discount')}</th>
                <th className="px-2 py-2 text-end">{both('taxable')}</th>
                <th className="px-2 py-2 text-center">{both('vatRate')}</th>
                <th className="px-2 py-2 text-end">{both('vat')}</th>
                <th className="py-2 ps-2 text-end">{both('lineTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id} className="border-b border-sand-200 align-top">
                  <td className="py-2 pe-3">
                    {l.nameAr}
                    <span lang="en" className="block text-xs text-ink-500">
                      {l.nameEn}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums">{l.quantity}</td>
                  <td className="px-2 py-2 text-end tabular-nums">{amount(l.priceNet)}</td>
                  <td className="px-2 py-2 text-end tabular-nums">{l.discountNet ? amount(l.discountNet) : '0.00'}</td>
                  <td className="px-2 py-2 text-end tabular-nums">{amount(l.net)}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{l.vatRateBp / 100}%</td>
                  <td className="px-2 py-2 text-end tabular-nums">{amount(l.vat)}</td>
                  <td className="py-2 ps-2 text-end tabular-nums">{amount(l.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ms-auto flex max-w-sm flex-col gap-2">
          <Total label={both('totalExVat')} value={amount(inv.totals.net)} />
          {inv.vatBreakdown.map((b) => (
            <Total key={b.rateBp} label={<>{both('totalVat')} <span className="text-xs">({b.rateBp / 100}%)</span></>} value={amount(b.vat)} />
          ))}
          <Total label={both('totalInclVat')} value={amount(inv.totals.total)} strong testId="invoice-total" />
        </dl>
        <p className="mt-4 text-xs text-ink-500">
          {ar('currency')} · <span dir="ltr">{en('currency')}</span>
        </p>
      </article>
    </div>
  );
}

function Item({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-ink-700">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function Total({ label, value, strong, testId }: { label: React.ReactNode; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className={strong ? 'flex items-start justify-between gap-4 border-t border-sand-300 pt-2 text-base font-bold' : 'flex items-start justify-between gap-4'}>
      <dt>{label}</dt>
      <dd dir="ltr" className="tabular-nums" data-testid={testId}>
        {value} SAR
      </dd>
    </div>
  );
}

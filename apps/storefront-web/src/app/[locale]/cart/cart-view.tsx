'use client';

import { Alert, Button, Card, Checkbox, Spinner, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { usePriceFormatter } from '@/components/price';
import { Link } from '@/i18n/navigation';
import { pick, type Media } from '@/lib/catalog-types';
import { announceCartCount } from '@/lib/shop-store';

interface CartLine {
  id: string;
  sku: string;
  product: { slugAr: string; slugEn: string; nameAr: string; nameEn: string | null; image: Media | null; pricingMode: string; isMadeToMeasure: boolean };
  options: Array<{ attributeKey: string; nameAr: string; nameEn: string | null; labelAr: string; labelEn: string | null }>;
  quantity: number;
  isSample: boolean;
  lengthCm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  giftWrap: boolean;
  giftMessage: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  maxQuantity: number;
  issue: string | null;
  available?: number;
}

interface CartData {
  items: CartLine[];
  totals: { subtotal: number; giftWrap: number; vat: number; total: number; itemCount: number };
  vat: { rateBp: number } | null;
  giftWrapPrice: number | null;
  canCheckout: boolean;
}

export function CartView() {
  const t = useTranslations('shop');
  const tc = useTranslations('checkout');
  const locale = useLocale();
  const format = usePriceFormatter();
  const [cart, setCart] = useState<CartData | null>(null);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (data: CartData) => {
    setCart(data);
    announceCartCount(data.totals.itemCount);
  };

  useEffect(() => {
    fetch('/bff/cart', { headers: { 'X-HD-Locale': locale } })
      .then((r) => r.json())
      .then(apply)
      .catch(() => setError(t('cartEmpty')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutate = async (lineId: string, method: 'PATCH' | 'DELETE', body?: unknown) => {
    setBusyLine(lineId);
    setError(null);
    try {
      const res = await fetch(`/bff/cart/items/${lineId}`, { method, headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale }, body: body ? JSON.stringify(body) : undefined });
      const json = (await res.json()) as CartData & { message?: string };
      if (!res.ok) throw new Error(json.message ?? res.statusText);
      apply(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyLine(null);
    }
  };

  if (!cart) {
    return (
      <div className="flex justify-center py-20" role="status" aria-label={t('cartTitle')}>
        <Spinner className="size-8 text-brand-600" />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <Card className="mt-8 p-12 text-center">
        <p className="text-lg font-semibold">{t('cartEmpty')}</p>
        <p className="mt-2 text-ink-500">{t('cartEmptyHint')}</p>
        <Link href="/" className="mt-6 inline-flex h-12 items-center rounded-xl bg-brand-600 px-6 font-medium text-white hover:bg-brand-700">
          {t('continueShopping')}
        </Link>
      </Card>
    );
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
      <ul className="flex flex-col gap-4">
        {cart.items.map((line) => {
          const name = pick(locale, line.product.nameAr, line.product.nameEn);
          const href = `/p/${encodeURIComponent(locale === 'en' ? line.product.slugEn : line.product.slugAr)}`;
          const busy = busyLine === line.id;
          return (
            <li key={line.id}>
              <Card className={cn('flex gap-4 p-4', line.issue && 'ring-2 ring-danger-600/40', busy && 'opacity-60')}>
                <Link href={href} className="shrink-0 overflow-hidden rounded-lg bg-sand-100">
                  {line.product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- thumbnail rendition
                    <img src={line.product.image.thumbnailUrl} alt="" width={96} height={120} className="h-30 w-24 object-cover" />
                  ) : (
                    <span className="block h-30 w-24" />
                  )}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={href} className="font-medium hover:text-brand-700">
                      {name}
                    </Link>
                    <span className="shrink-0 font-semibold">{line.lineTotal !== null ? format(line.lineTotal) : '—'}</span>
                  </div>
                  <p className="text-sm text-ink-500">
                    {[
                      line.isSample ? t('sample') : null,
                      ...line.options.map((o) => `${pick(locale, o.nameAr, o.nameEn)}: ${pick(locale, o.labelAr, o.labelEn)}`),
                      line.widthMm && line.heightMm ? `${t('size')}: ${line.widthMm / 10} × ${line.heightMm / 10} cm` : null,
                      line.lengthCm ? `${t('size')}: ${line.lengthCm} cm` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {line.unitPrice !== null && line.quantity > 1 && <p className="text-xs text-ink-500">{format(line.unitPrice)} × {line.quantity}</p>}
                  {line.issue && <p className="text-sm font-medium text-danger-600">{t(`issue_${line.issue}` as 'issue_insufficientStock', { available: line.available ?? 0 })}</p>}

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {!line.isSample && (
                      <div className="flex items-center rounded-lg border border-sand-300" role="group" aria-label={`${t('quantity')}: ${name}`}>
                        <button type="button" aria-label={t('decrease')} disabled={busy || line.quantity <= 1} onClick={() => mutate(line.id, 'PATCH', { quantity: line.quantity - 1 })} className="size-9 disabled:opacity-40">
                          −
                        </button>
                        <span className="w-8 text-center text-sm">{line.quantity}</span>
                        <button type="button" aria-label={t('increase')} disabled={busy || line.quantity >= line.maxQuantity} onClick={() => mutate(line.id, 'PATCH', { quantity: line.quantity + 1 })} className="size-9 disabled:opacity-40">
                          +
                        </button>
                      </div>
                    )}
                    <button type="button" disabled={busy} onClick={() => mutate(line.id, 'DELETE')} className="text-sm text-ink-500 underline-offset-4 hover:text-danger-600 hover:underline">
                      {t('remove')}
                    </button>
                  </div>
                  {!line.isSample && cart.giftWrapPrice !== null && (
                    <GiftWrap line={line} price={format(cart.giftWrapPrice)} disabled={busy} onChange={(body) => mutate(line.id, 'PATCH', body)} />
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <aside>
        <Card className="sticky top-24 flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{t('orderSummary')}</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt>{t('subtotal')}</dt>
              <dd>{format(cart.totals.subtotal)}</dd>
            </div>
            {cart.totals.giftWrap > 0 && (
              <div className="flex justify-between">
                <dt>{t('giftWrapping')}</dt>
                <dd>{format(cart.totals.giftWrap)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-sand-200 pt-2 text-base font-semibold">
              <dt>{t('total')}</dt>
              <dd>{format(cart.totals.total)}</dd>
            </div>
            {cart.vat && (
              <div className="flex justify-between text-xs text-ink-500">
                <dt>{t('vatAmount', { rate: cart.vat.rateBp / 100 })}</dt>
                <dd>{format(cart.totals.vat)}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs text-ink-500">{t('shippingAtCheckout')}</p>
          {!cart.canCheckout && <Alert>{t('fixIssues')}</Alert>}
          {error && <Alert>{error}</Alert>}
          {cart.canCheckout ? (
            <Link href="/checkout" className="inline-flex h-13 items-center justify-center rounded-xl bg-brand-600 px-7 text-lg font-medium text-white hover:bg-brand-700">
              {tc('goToCheckout')}
            </Link>
          ) : (
            <span aria-disabled="true" className="inline-flex h-13 cursor-not-allowed items-center justify-center rounded-xl bg-sand-200 px-7 text-lg font-medium text-ink-500">
              {tc('goToCheckout')}
            </span>
          )}
          <Link href="/" className="text-center text-sm text-brand-700 hover:underline">
            {t('continueShopping')}
          </Link>
        </Card>
      </aside>
    </div>
  );
}

function GiftWrap({ line, price, disabled, onChange }: { line: CartLine; price: string; disabled: boolean; onChange: (body: Record<string, unknown>) => void }) {
  const t = useTranslations('shop');
  const [message, setMessage] = useState(line.giftMessage ?? '');
  return (
    <div className="mt-2 flex flex-col gap-2">
      <Checkbox label={t('giftWrapPrice', { price })} checked={line.giftWrap} disabled={disabled} onChange={(e) => onChange({ giftWrap: e.target.checked })} />
      {line.giftWrap && (
        <div className="flex gap-2">
          <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={250} placeholder={t('giftMessage')} aria-label={t('giftMessage')} className="h-10 flex-1 rounded-lg border border-sand-300 px-3 text-sm" />
          {message !== (line.giftMessage ?? '') && (
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onChange({ giftWrap: true, giftMessage: message })}>
              ✓
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { priceLine } from '@hudhud/domain';
import { Alert, Button, Checkbox, cn } from '@hudhud/ui';
import { STOREFRONT_COOKIES } from '@hudhud/web-core/cookie-names';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Price } from '@/components/price';
import { WishlistButton } from '@/components/wishlist-button';
import { Link } from '@/i18n/navigation';
import { pick, type ProductDetail } from '@/lib/catalog-types';
import { useCookie } from '@/lib/client-cookies';
import { announceCartCount, toggleCompare, trackRecentlyViewed, useCompare } from '@/lib/shop-store';
import { Configurator } from './configurator/configurator';
import { DeliveryEstimate } from './delivery-estimate';
import { ProductGallery } from './product-gallery';
import { SizeGuideDialog } from './size-guide-dialog';

type Variant = ProductDetail['variants'][number];
const LIMITS_CM = { min: 20, max: 600, lengthMin: 50, lengthMax: 2000 };

export function ProductExperience({
  product,
  whatsapp,
  productUrl,
  cities,
}: {
  product: ProductDetail;
  whatsapp: string;
  productUrl: string;
  cities: Array<{ code: string; nameAr: string; nameEn: string }>;
}) {
  const t = useTranslations('shop');
  const locale = useLocale();
  const signedIn = useCookie(STOREFRONT_COOKIES.hint) === '1';
  const compare = useCompare();
  const name = pick(locale, product.nameAr, product.nameEn);

  const initial = product.variants.find((v) => v.isDefault && v.available) ?? product.variants.find((v) => v.available) ?? product.variants[0];
  const [selection, setSelection] = useState<Record<string, string>>(initial?.options ?? {});
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState({ width: '', height: '', length: '' });
  const [giftWrap, setGiftWrap] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'info'; text: string; cartLink?: boolean } | null>(null);

  useEffect(() => trackRecentlyViewed(product.id), [product.id]);

  const variant: Variant | undefined = useMemo(
    () => product.variants.find((v) => product.axes.every((a) => v.options[a.key] === selection[a.key])),
    [product, selection],
  );

  /** A value is offered if some variant has it together with the other current selections. */
  const optionState = (axisKey: string, code: string) => {
    const candidates = product.variants.filter((v) => v.options[axisKey] === code && product.axes.every((a) => a.key === axisKey || v.options[a.key] === selection[a.key]));
    return { exists: candidates.length > 0, available: candidates.some((v) => v.available) };
  };

  const select = (axisKey: string, code: string) => {
    const next = { ...selection, [axisKey]: code };
    // If the combination does not exist, jump to the closest existing variant with this value.
    if (!product.variants.some((v) => product.axes.every((a) => v.options[a.key] === next[a.key]))) {
      const fallback = product.variants.find((v) => v.options[axisKey] === code && v.available) ?? product.variants.find((v) => v.options[axisKey] === code);
      if (fallback) return setSelection(fallback.options);
    }
    setSelection(next);
  };

  // Measured products (blinds per m², fabric per metre): live price for the entered size.
  const measured = product.pricingMode === 'PER_SQM' || product.pricingMode === 'PER_METER';
  const cm = (v: string) => Number(v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
  const sizeValid =
    product.pricingMode === 'PER_SQM'
      ? cm(size.width) >= LIMITS_CM.min && cm(size.width) <= LIMITS_CM.max && cm(size.height) >= LIMITS_CM.min && cm(size.height) <= LIMITS_CM.max
      : product.pricingMode === 'PER_METER'
        ? cm(size.length) >= LIMITS_CM.lengthMin && cm(size.length) <= LIMITS_CM.lengthMax
        : true;
  const unitPrice = useMemo(() => {
    if (!variant) return product.price;
    if (!measured || !sizeValid) return variant.price;
    return product.pricingMode === 'PER_SQM'
      ? priceLine({ mode: 'PER_SQM', pricePerSqm: variant.price, widthMm: Math.round(cm(size.width) * 10), heightMm: Math.round(cm(size.height) * 10), quantity: 1 }).unitPrice
      : priceLine({ mode: 'PER_METER', pricePerMeter: variant.price, lengthCm: Math.round(cm(size.length)), quantity: 1 }).unitPrice;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, size, measured, sizeValid]);

  // Made-to-measure: CALCULATED products are always configured; an abaya template adds optional custom tailoring.
  const configurable = Boolean(product.configurator);
  const [custom, setCustom] = useState(product.pricingMode === 'CALCULATED');
  const configured = product.pricingMode === 'CALCULATED' || (configurable && custom);
  const canBuy = Boolean(variant?.available) && !configured && (!measured || sizeValid);
  const colorAxis = product.axes.find((a) => a.type === 'COLOR');
  const swatchHex = colorAxis?.values.find((v) => v.code === selection[colorAxis.key])?.swatchHex ?? null;

  async function addToCart(isSample = false) {
    if (!variant) return;
    setBusy(true);
    setMessage(null);
    const body: Record<string, unknown> = { variantId: variant.id, quantity: isSample ? 1 : quantity, isSample };
    if (!isSample && product.pricingMode === 'PER_SQM') Object.assign(body, { widthMm: Math.round(cm(size.width) * 10), heightMm: Math.round(cm(size.height) * 10) });
    if (!isSample && product.pricingMode === 'PER_METER') Object.assign(body, { lengthCm: Math.round(cm(size.length)) });
    if (!isSample && giftWrap) Object.assign(body, { giftWrap: true, giftMessage: giftMessage || undefined });
    try {
      const res = await fetch('/bff/cart/items', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale }, body: JSON.stringify(body) });
      const json = (await res.json()) as { message?: string; totals?: { itemCount: number } };
      if (!res.ok) throw new Error(json.message ?? res.statusText);
      announceCartCount(json.totals?.itemCount ?? 0);
      setMessage({ tone: 'success', text: isSample ? t('sampleAdded') : t('added'), cartLink: true });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function notifyMe() {
    if (!variant) return;
    const res = await fetch(`/bff/notify-me/${variant.id}`, { method: 'POST', headers: { 'X-HD-Locale': locale } });
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    setMessage(res.ok ? { tone: 'success', text: t('notifySaved') } : { tone: 'danger', text: json.message ?? res.statusText });
  }

  const waText = t('whatsappMessage', { name, sku: variant?.sku ?? '', url: productUrl });
  const waNumber = whatsapp.replace(/\D/g, '');
  const waHref = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;
  const inCompare = compare.includes(product.id);

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
      <ProductGallery media={product.media} productName={name} selectedVariantId={variant?.id} />

      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{name}</h1>
          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            {((measured && !sizeValid) || product.pricingMode === 'CALCULATED') && <span className="text-ink-500">{t('from')}</span>}
            <Price amount={unitPrice} compareAt={measured ? null : variant?.compareAtPrice} size="lg" />
            {measured && !sizeValid && <span className="text-sm text-ink-500">{product.pricingMode === 'PER_SQM' ? t('perSqm') : t('perMeter')}</span>}
            {product.configurator?.kind === 'CURTAIN' && <span className="text-sm text-ink-500">{t('perMeterFabric')}</span>}
            {product.configurator?.kind === 'BLIND' && <span className="text-sm text-ink-500">{t('perSqm')}</span>}
            {variant && variant.discountPercent > 0 && !measured && (
              <span className="rounded-full bg-danger-600 px-2.5 py-0.5 text-sm font-semibold text-white">{t('off', { percent: variant.discountPercent })}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-500">{t('vatIncluded')}</p>
        </div>

        {product.axes.map((axis) => (
          <fieldset key={axis.key}>
            <legend className="mb-2 text-sm font-medium">
              {pick(locale, axis.nameAr, axis.nameEn)}:{' '}
              <span className="text-ink-700">{pick(locale, axis.values.find((v) => v.code === selection[axis.key])?.labelAr, axis.values.find((v) => v.code === selection[axis.key])?.labelEn)}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {axis.values.map((v) => {
                const state = optionState(axis.key, v.code);
                const on = selection[axis.key] === v.code;
                const label = pick(locale, v.labelAr, v.labelEn);
                if (axis.type === 'COLOR') {
                  return (
                    <button
                      key={v.code}
                      type="button"
                      aria-pressed={on}
                      aria-label={state.available ? label : `${label} (${t('outOfStock')})`}
                      title={label}
                      onClick={() => select(axis.key, v.code)}
                      className={cn('relative size-10 rounded-full border-2 transition', on ? 'border-brand-600 ring-2 ring-brand-100' : 'border-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]', !state.available && 'opacity-50')}
                      style={{ background: v.swatchHex ?? '#ddd' }}
                    >
                      {!state.available && <span aria-hidden="true" className="absolute inset-0 m-auto h-0.5 w-full rotate-45 bg-ink-900/60" />}
                    </button>
                  );
                }
                return (
                  <button
                    key={v.code}
                    type="button"
                    aria-pressed={on}
                    disabled={!state.exists}
                    onClick={() => select(axis.key, v.code)}
                    className={cn(
                      'min-w-12 rounded-xl border px-3.5 py-2 text-sm transition',
                      on ? 'border-brand-600 bg-brand-50 font-medium text-brand-700' : 'border-sand-300 bg-white hover:border-ink-500',
                      !state.available && 'text-ink-500 line-through decoration-ink-500/60',
                      !state.exists && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        {product.sizeGuide && <SizeGuideDialog guide={product.sizeGuide} />}

        {measured && !configured && (
          <fieldset className="rounded-card bg-sand-100 p-4">
            <legend className="sr-only">{t('measurements')}</legend>
            <p className="mb-3 text-sm font-medium">{t('measurements')}</p>
            <div className="grid grid-cols-2 gap-3">
              {product.pricingMode === 'PER_SQM' ? (
                <>
                  <SizeInput label={t('widthCm')} value={size.width} onChange={(width) => setSize({ ...size, width })} />
                  <SizeInput label={t('heightCm')} value={size.height} onChange={(height) => setSize({ ...size, height })} />
                </>
              ) : (
                <SizeInput label={t('lengthCm')} value={size.length} onChange={(length) => setSize({ ...size, length })} />
              )}
            </div>
            <p className="mt-2 text-xs text-ink-500">
              {product.pricingMode === 'PER_SQM' ? t('measurementsHint', { min: LIMITS_CM.min, max: LIMITS_CM.max }) : t('measurementsHint', { min: LIMITS_CM.lengthMin, max: LIMITS_CM.lengthMax })}
            </p>
          </fieldset>
        )}

        {configurable && product.pricingMode !== 'CALCULATED' && (
          <div role="radiogroup" aria-label={t('customTailoring')} className="grid grid-cols-2 gap-2">
            {[false, true].map((on) => (
              <button
                key={String(on)}
                type="button"
                role="radio"
                aria-checked={custom === on}
                onClick={() => setCustom(on)}
                className={cn('rounded-xl border px-3 py-2.5 text-sm', custom === on ? 'border-brand-600 bg-brand-50 font-medium text-brand-700' : 'border-sand-300 bg-white')}
              >
                {on ? t('customTailoring') : t('standardSize')}
              </button>
            ))}
          </div>
        )}

        {configured && configurable ? (
          <Configurator productId={product.id} productName={name} variantId={variant?.id} swatchHex={swatchHex} whatsapp={whatsapp} productUrl={productUrl} signedIn={signedIn} />
        ) : configured ? (
          <div className="rounded-card border border-brand-100 bg-brand-50 p-4">
            <p className="font-semibold text-brand-700">{t('configuredTitle')}</p>
            <p className="mt-1 text-sm text-ink-700">{t('configuredHint')}</p>
            {waNumber && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-11 items-center rounded-xl bg-success-600 px-5 text-sm font-medium text-white">
                {t('askOnWhatsApp')}
              </a>
            )}
          </div>
        ) : (
          <>
            {variant && !variant.available ? (
              <div className="flex flex-col gap-2">
                <p className="font-medium text-danger-600">{t('outOfStock')}</p>
                {signedIn ? (
                  <Button variant="secondary" onClick={notifyMe}>
                    {t('notifyMe')}
                  </Button>
                ) : (
                  <Link href={`/login?next=${encodeURIComponent(`/p/${locale === 'en' ? product.slugEn : product.slugAr}`)}`} className="text-sm text-brand-700 hover:underline">
                    {t('signInToNotify')}
                  </Link>
                )}
              </div>
            ) : (
              variant?.lowStock && <p className="text-sm font-medium text-accent-500">{t('lowStock')}</p>
            )}

            {product.vertical === 'ABAYAS' && variant?.available && (
              <div className="flex flex-col gap-2">
                <Checkbox label={t('giftWrap')} checked={giftWrap} onChange={(e) => setGiftWrap(e.target.checked)} />
                {giftWrap && (
                  <input value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} maxLength={250} placeholder={t('giftMessage')} aria-label={t('giftMessage')} className="h-11 rounded-xl border border-sand-300 bg-white px-3 text-sm" />
                )}
              </div>
            )}

            <div className="flex items-stretch gap-3">
              <div className="flex items-center rounded-xl border border-sand-300 bg-white" role="group" aria-label={t('quantity')}>
                <button type="button" aria-label={t('decrease')} disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="size-12 text-lg disabled:opacity-40">
                  −
                </button>
                <span aria-live="polite" className="w-8 text-center font-medium">
                  {quantity}
                </span>
                <button type="button" aria-label={t('increase')} disabled={quantity >= 20} onClick={() => setQuantity((q) => Math.min(20, q + 1))} className="size-12 text-lg disabled:opacity-40">
                  +
                </button>
              </div>
              <Button size="lg" className="flex-1" disabled={!canBuy} loading={busy} onClick={() => addToCart()}>
                {!variant ? t('chooseOptionsFirst') : t('addToCart')}
              </Button>
            </div>
          </>
        )}

        {message && (
          <Alert tone={message.tone}>
            {message.text}{' '}
            {message.cartLink && (
              <Link href="/cart" className="font-medium underline">
                {t('viewCart')}
              </Link>
            )}
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <WishlistButton productId={product.id} productName={name} variant="button" />
          <button
            type="button"
            aria-pressed={inCompare}
            onClick={() => {
              const r = toggleCompare(product.id);
              if (r === 'full') setMessage({ tone: 'info', text: t('compareLimit') });
            }}
            className="h-12 rounded-xl border border-sand-300 bg-white px-4 text-sm font-medium hover:bg-sand-100"
          >
            {inCompare ? t('removeFromCompare') : t('addToCompare')}
          </button>
          {product.sampleAvailable && variant && !configured && (
            <button type="button" disabled={busy} onClick={() => addToCart(true)} className="h-12 rounded-xl border border-sand-300 bg-white px-4 text-sm font-medium hover:bg-sand-100">
              {t('orderSample')} {product.samplePrice === 0 ? `(${t('sampleFree')})` : ''}
            </button>
          )}
          {waNumber && !configured && (
            <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center rounded-xl border border-success-600/40 bg-success-50 px-4 text-sm font-medium text-success-600">
              {t('askOnWhatsApp')}
            </a>
          )}
        </div>

        <DeliveryEstimate productId={product.id} cities={cities} />
      </div>
    </div>
  );
}

function SizeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-700">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" dir="ltr" className="h-11 rounded-xl border border-sand-300 bg-white px-3" />
    </label>
  );
}

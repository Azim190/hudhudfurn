'use client';

import { Alert, Button, Card, Field, SelectField, Spinner, TextAreaField, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePriceFormatter } from '@/components/price';
import { Link, useRouter } from '@/i18n/navigation';
import { pick, type Media } from '@/lib/catalog-types';
import { announceCartCount } from '@/lib/shop-store';

export interface CheckoutCity {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
}

export interface PickupLocation {
  id: string;
  nameAr: string;
  nameEn: string | null;
  city: { code: string; nameAr: string; nameEn: string } | null;
  readyMinDays: number;
  readyMaxDays: number;
}

export interface SavedAddress {
  id: string;
  label: string | null;
  recipientName: string;
  phoneE164: string;
  street: string | null;
  isDefault: boolean;
  city: { code: string; nameAr: string; nameEn: string };
  district: { nameAr: string; nameEn: string } | null;
}

type Method = 'CARD' | 'TABBY' | 'TAMARA' | 'COD';

interface Quote {
  items: Array<{ id: string; nameAr: string; nameEn: string | null; image: Media | null; quantity: number; isSample: boolean; total: number | null; discount: number; issue: string | null; options: Array<{ labelAr: string; labelEn: string | null }> }>;
  shippingOptions: Array<{ rateId: string; nameAr: string; nameEn: string; price: number; listPrice: number; etaMinDays: number; etaMaxDays: number }>;
  selectedShippingRateId: string | null;
  eta: { minDays: number; maxDays: number } | null;
  paymentMethods: Array<{ method: Method; available: boolean; reason?: string; fee?: number }>;
  selectedPaymentMethod: Method | null;
  promotions: Array<{ id: string; code: string | null; nameAr: string; nameEn: string; discount: number; freeShipping: boolean }>;
  coupon: { code: string | null; applied: boolean; problem: string | null } | null;
  totals: { subtotal: number; discount: number; giftWrap: number; shipping: number; codFee: number; vat: number; total: number };
  vatBreakdown: Array<{ rateBp: number }>;
  hasMadeToMeasure: boolean;
  blockers: string[];
  canPlace: boolean;
}

interface AddressForm {
  recipientName: string;
  phone: string;
  cityCode: string;
  districtId: string;
  district: string;
  street: string;
  buildingNo: string;
  postalCode: string;
  shortAddress: string;
}

const emptyAddress: AddressForm = { recipientName: '', phone: '', cityCode: '', districtId: '', district: '', street: '', buildingNo: '', postalCode: '', shortAddress: '' };
const localPhone = (e164: string | null | undefined) => (e164 ? e164.replace(/^\+966/, '0') : '');
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');

function addressComplete(a: AddressForm) {
  return a.recipientName.trim().length >= 2 && a.phone.trim().length >= 9 && Boolean(a.cityCode) && a.street.trim().length >= 3 && (!a.buildingNo || /^\d{4}$/.test(a.buildingNo)) && (!a.postalCode || /^\d{5}$/.test(a.postalCode)) && (!a.shortAddress || /^[A-Za-z]{4}\d{4}$/.test(a.shortAddress));
}

export function CheckoutView({ cities, pickupLocations, addresses, user }: { cities: CheckoutCity[]; pickupLocations: PickupLocation[]; addresses: SavedAddress[]; user: { fullName: string | null; phoneE164: string | null; email: string | null } | null }) {
  const t = useTranslations('checkout');
  const tShop = useTranslations('shop');
  const locale = useLocale();
  const router = useRouter();
  const format = usePriceFormatter();

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [fulfillment, setFulfillment] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [addressId, setAddressId] = useState<string>(defaultAddress?.id ?? '');
  const [address, setAddress] = useState<AddressForm>({ ...emptyAddress, recipientName: user?.fullName ?? '', phone: localPhone(user?.phoneE164) });
  const [districts, setDistricts] = useState<Array<{ id: string; nameAr: string; nameEn: string }>>([]);
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [shippingRateId, setShippingRateId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<Method | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | null>(null);
  const [contact, setContact] = useState({ name: user?.fullName ?? '', phone: localPhone(user?.phoneE164), email: user?.email ?? '' });
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const attempt = useRef<{ key: string; body: string } | null>(null);

  const useSaved = fulfillment === 'DELIVERY' && Boolean(addressId) && addresses.length > 0;
  const city = cities.find((c) => c.code === address.cityCode);

  useEffect(() => {
    if (!city) return setDistricts([]);
    fetch(`/bff/geo/cities/${city.id}/districts`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDistricts)
      .catch(() => setDistricts([]));
  }, [city]);

  const destination = useMemo(() => {
    if (fulfillment === 'PICKUP') return { fulfillment, pickupLocationId: pickupLocationId || undefined };
    if (useSaved) return { fulfillment, addressId };
    const complete = addressComplete(address);
    return {
      fulfillment,
      cityCode: address.cityCode || undefined,
      address: complete
        ? {
            recipientName: address.recipientName.trim(),
            phone: address.phone.trim(),
            cityCode: address.cityCode,
            districtId: address.districtId && address.districtId !== 'other' ? address.districtId : undefined,
            district: address.districtId === 'other' ? address.district.trim() || undefined : undefined,
            street: address.street.trim(),
            buildingNo: address.buildingNo || undefined,
            postalCode: address.postalCode || undefined,
            shortAddress: address.shortAddress || undefined,
          }
        : undefined,
    };
  }, [fulfillment, pickupLocationId, useSaved, addressId, address]);

  const quoteBody = useMemo(
    () => ({ ...destination, shippingRateId: fulfillment === 'DELIVERY' ? (shippingRateId ?? undefined) : undefined, couponCode: coupon ?? undefined, paymentMethod: paymentMethod ?? undefined }),
    [destination, fulfillment, shippingRateId, coupon, paymentMethod],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const res = await fetch('/bff/checkout/quote', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale }, body: JSON.stringify(quoteBody), signal: ctrl.signal });
        const json = await res.json();
        if (res.status === 400 && json.code === 'cartEmpty') return setEmpty(true);
        if (!res.ok) throw new Error(json.message ?? res.statusText);
        setQuote(json as Quote);
        setError(null);
      } catch (err) {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!ctrl.signal.aborted) setQuoting(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [quoteBody, locale]);

  // Drop a payment method that became unavailable (e.g. COD after switching to pickup).
  useEffect(() => {
    if (quote && paymentMethod && !quote.paymentMethods.find((m) => m.method === paymentMethod)?.available) setPaymentMethod(null);
  }, [quote, paymentMethod]);

  const place = async () => {
    if (!quote || !paymentMethod) return;
    const body = {
      ...quoteBody,
      paymentMethod,
      contact: { name: (contact.name || (useSaved ? '' : address.recipientName)).trim(), phone: (contact.phone || address.phone).trim(), email: contact.email.trim() || undefined },
      customerNote: note.trim() || undefined,
      locale,
      expectedTotal: quote.totals.total,
    };
    const serialized = JSON.stringify(body);
    // Same submission → same key, so a retried request can never create a second order.
    if (!attempt.current || attempt.current.body !== serialized) attempt.current = { key: newKey(), body: serialized };
    setPlacing(true);
    setError(null);
    try {
      const res = await fetch('/bff/checkout/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale, 'Idempotency-Key': attempt.current.key }, body: serialized });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 409 && json.details?.reason === 'totalChanged') setQuote((q) => (q ? { ...q, totals: { ...q.totals, total: json.details.total } } : q));
        throw new Error(json.message ?? res.statusText);
      }
      announceCartCount(0);
      if (json.payment?.redirectUrl) window.location.assign(json.payment.redirectUrl);
      else router.push(`/orders/${json.order.id}?placed=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPlacing(false);
    }
  };

  if (empty) {
    return (
      <Card className="mt-8 p-12 text-center">
        <p className="text-lg font-semibold">{tShop('cartEmpty')}</p>
        <Link href="/cart" className="mt-6 inline-flex h-12 items-center rounded-xl bg-brand-600 px-6 font-medium text-white hover:bg-brand-700">
          {t('backToCart')}
        </Link>
      </Card>
    );
  }

  const set = (patch: Partial<AddressForm>) => setAddress((a) => ({ ...a, ...patch }));
  const methodLabel = (m: Method) => t(`method_${m}`);
  const unavailable = (reason?: string) => t(`unavailable_${reason ?? 'disabled'}` as 'unavailable_disabled');

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-6">
        <Section title={t('contact')}>
          {!user && (
            <p className="text-sm text-ink-500">
              {t('signInPrompt')}{' '}
              <Link href="/login?next=/checkout" className="font-medium text-brand-700 hover:underline">
                {t('signIn')}
              </Link>
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('fullName')} value={contact.name} onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} autoComplete="name" required />
            <Field label={t('phone')} value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} autoComplete="tel" inputMode="tel" ltr required />
            <div className="sm:col-span-2">
              <Field label={t('email')} type="email" value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} autoComplete="email" hint={t('emailHint')} ltr />
            </div>
          </div>
        </Section>

        <Section title={t('delivery')}>
          <div role="radiogroup" aria-label={t('delivery')} className="grid gap-3 sm:grid-cols-2">
            <Choice name="fulfillment" checked={fulfillment === 'DELIVERY'} onChange={() => setFulfillment('DELIVERY')} label={t('homeDelivery')} />
            {pickupLocations.length > 0 && <Choice name="fulfillment" checked={fulfillment === 'PICKUP'} onChange={() => setFulfillment('PICKUP')} label={t('storePickup')} />}
          </div>

          {fulfillment === 'DELIVERY' && (
            <>
              {addresses.length > 0 && (
                <div role="radiogroup" aria-label={t('savedAddresses')} className="flex flex-col gap-2">
                  <p className="text-sm font-medium">{t('savedAddresses')}</p>
                  {addresses.map((a) => (
                    <Choice
                      key={a.id}
                      name="address"
                      checked={addressId === a.id}
                      onChange={() => setAddressId(a.id)}
                      label={a.label || a.recipientName}
                      hint={[pick(locale, a.city.nameAr, a.city.nameEn), a.district ? pick(locale, a.district.nameAr, a.district.nameEn) : null, a.street].filter(Boolean).join('، ')}
                    />
                  ))}
                  <Choice name="address" checked={!addressId} onChange={() => setAddressId('')} label={t('newAddress')} />
                </div>
              )}
              {!useSaved && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('recipientName')} value={address.recipientName} onChange={(e) => set({ recipientName: e.target.value })} autoComplete="shipping name" required />
                  <Field label={t('phone')} value={address.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="shipping tel" inputMode="tel" ltr required />
                  <SelectField label={t('city')} value={address.cityCode} onChange={(e) => set({ cityCode: e.target.value, districtId: '', district: '' })} required>
                    <option value="">{t('chooseCity')}</option>
                    {cities.map((c) => (
                      <option key={c.code} value={c.code}>
                        {pick(locale, c.nameAr, c.nameEn)}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField label={t('district')} value={address.districtId} onChange={(e) => set({ districtId: e.target.value })} disabled={!address.cityCode}>
                    <option value="">{t('chooseDistrict')}</option>
                    {districts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {pick(locale, d.nameAr, d.nameEn)}
                      </option>
                    ))}
                    <option value="other">{t('otherDistrict')}</option>
                  </SelectField>
                  {address.districtId === 'other' && <Field label={t('districtName')} value={address.district} onChange={(e) => set({ district: e.target.value })} />}
                  <div className="sm:col-span-2">
                    <Field label={t('street')} value={address.street} onChange={(e) => set({ street: e.target.value })} autoComplete="shipping street-address" required />
                  </div>
                  <Field label={t('buildingNo')} value={address.buildingNo} onChange={(e) => set({ buildingNo: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" ltr />
                  <Field label={t('postalCode')} value={address.postalCode} onChange={(e) => set({ postalCode: e.target.value.replace(/\D/g, '').slice(0, 5) })} inputMode="numeric" autoComplete="shipping postal-code" ltr />
                  <Field label={t('shortAddress')} hint={t('shortAddressHint')} value={address.shortAddress} onChange={(e) => set({ shortAddress: e.target.value.toUpperCase().slice(0, 8) })} ltr />
                </div>
              )}

              {quote && quote.shippingOptions.length > 0 && (
                <div role="radiogroup" aria-label={t('shippingMethod')} className="flex flex-col gap-2">
                  <p className="text-sm font-medium">{t('shippingMethod')}</p>
                  {quote.shippingOptions.map((o) => (
                    <Choice
                      key={o.rateId}
                      name="shipping"
                      checked={quote.selectedShippingRateId === o.rateId}
                      onChange={() => setShippingRateId(o.rateId)}
                      label={pick(locale, o.nameAr, o.nameEn)}
                      hint={t('eta', { min: o.etaMinDays, max: o.etaMaxDays })}
                      aside={
                        o.price === 0 ? (
                          <span className="font-semibold text-success-600">
                            {t('free')} {o.listPrice > 0 && <s className="ms-1 text-xs text-ink-500">{format(o.listPrice)}</s>}
                          </span>
                        ) : (
                          <span className="font-semibold">{format(o.price)}</span>
                        )
                      }
                    />
                  ))}
                </div>
              )}
              {quote?.blockers.includes('shippingUnavailable') && <Alert>{t('noShipping')}</Alert>}
            </>
          )}

          {fulfillment === 'PICKUP' && (
            <div role="radiogroup" aria-label={t('pickupLocation')} className="flex flex-col gap-2">
              {pickupLocations.map((l) => (
                <Choice
                  key={l.id}
                  name="pickup"
                  checked={pickupLocationId === l.id}
                  onChange={() => setPickupLocationId(l.id)}
                  label={pick(locale, l.nameAr, l.nameEn)}
                  hint={quote?.eta && pickupLocationId === l.id ? t('pickupReady', { min: quote.eta.minDays, max: quote.eta.maxDays }) : l.city ? pick(locale, l.city.nameAr, l.city.nameEn) : undefined}
                />
              ))}
            </div>
          )}
        </Section>

        <Section title={t('payment')}>
          <div role="radiogroup" aria-label={t('payment')} className="flex flex-col gap-2">
            {(quote?.paymentMethods ?? []).map((m) => (
              <Choice
                key={m.method}
                name="payment"
                checked={paymentMethod === m.method}
                disabled={!m.available}
                onChange={() => setPaymentMethod(m.method)}
                label={methodLabel(m.method)}
                hint={!m.available ? unavailable(m.reason) : m.fee ? t('codFee', { fee: format(m.fee) }) : undefined}
              />
            ))}
          </div>
          <p className="text-xs text-ink-500">{t('securePayments')}</p>
        </Section>

        <Section title={t('note')}>
          <TextAreaField label={t('note')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} />
        </Section>
      </div>

      <aside>
        <Card className="sticky top-24 flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('summary')}</h2>
            {quoting && <Spinner className="size-4 text-brand-600" aria-label={t('summary')} />}
          </div>
          {quote && (
            <>
              <ul className="flex flex-col gap-3 text-sm">
                {quote.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3">
                    <span className="relative shrink-0 overflow-hidden rounded-md bg-sand-100">
                      {i.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- thumbnail rendition
                        <img src={i.image.thumbnailUrl} alt="" width={48} height={60} className="h-15 w-12 object-cover" />
                      ) : (
                        <span className="block h-15 w-12" />
                      )}
                      <span className="absolute end-0 top-0 rounded-es-md bg-ink-900 px-1.5 text-xs text-white">{i.quantity}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2">{pick(locale, i.nameAr, i.nameEn)}</span>
                      {i.options.length > 0 && <span className="block text-xs text-ink-500">{i.options.map((o) => pick(locale, o.labelAr, o.labelEn)).join(' · ')}</span>}
                    </span>
                    <span className="shrink-0">{i.total !== null ? format(i.total) : '—'}</span>
                  </li>
                ))}
              </ul>

              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setCoupon(couponInput.trim() || null);
                }}
              >
                <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder={t('coupon')} aria-label={t('coupon')} dir="ltr" className="h-11 min-w-0 flex-1 rounded-xl border border-sand-300 px-3 text-sm" />
                {coupon ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-11"
                    onClick={() => {
                      setCoupon(null);
                      setCouponInput('');
                    }}
                  >
                    {t('removeCoupon')}
                  </Button>
                ) : (
                  <Button type="submit" variant="secondary" size="sm" className="h-11" disabled={!couponInput.trim()}>
                    {t('applyCoupon')}
                  </Button>
                )}
              </form>
              {quote.coupon?.applied && <p className="text-sm text-success-600">{t('couponApplied', { code: quote.coupon.code ?? '' })}</p>}
              {quote.coupon?.problem && <p className="text-sm text-danger-600" role="alert">{t(`coupon_${quote.coupon.problem}` as 'coupon_unknown')}</p>}

              <dl className="flex flex-col gap-2 border-t border-sand-200 pt-3 text-sm">
                <Row label={t('subtotal')} value={format(quote.totals.subtotal)} />
                {quote.promotions
                  .filter((p) => p.discount > 0)
                  .map((p) => (
                    <Row key={p.id} label={pick(locale, p.nameAr, p.nameEn)} value={`−${format(p.discount)}`} tone="success" />
                  ))}
                {quote.totals.giftWrap > 0 && <Row label={t('giftWrap')} value={format(quote.totals.giftWrap)} />}
                {fulfillment === 'DELIVERY' && quote.selectedShippingRateId && <Row label={t('shipping')} value={quote.totals.shipping === 0 ? t('free') : format(quote.totals.shipping)} />}
                {quote.totals.codFee > 0 && <Row label={t('codFeeLine')} value={format(quote.totals.codFee)} />}
                <div className="flex justify-between border-t border-sand-200 pt-2 text-base font-semibold">
                  <dt>{t('total')}</dt>
                  <dd data-testid="checkout-total">{format(quote.totals.total)}</dd>
                </div>
                <Row label={t('vatIncluded', { rate: (quote.vatBreakdown[0]?.rateBp ?? 1500) / 100 })} value={format(quote.totals.vat)} small />
              </dl>

              {quote.hasMadeToMeasure && <p className="text-xs text-ink-500">{t('madeToMeasureNote')}</p>}
              {quote.blockers
                .filter((b) => b !== 'shippingUnavailable' && b !== 'paymentMethod')
                .map((b) => (
                  <p key={b} className="text-sm text-ink-700">
                    • {t(`blocker_${b}` as 'blocker_address')}
                  </p>
                ))}
              {!paymentMethod && <p className="text-sm text-ink-700">• {t('blocker_paymentMethod')}</p>}
              {quote.blockers.includes('cartIssues') && (
                <Link href="/cart" className="text-sm text-brand-700 hover:underline">
                  {t('backToCart')}
                </Link>
              )}
            </>
          )}
          {!quote && !error && (
            <div className="flex justify-center py-8">
              <Spinner className="size-6 text-brand-600" />
            </div>
          )}
          {error && <Alert>{error}</Alert>}
          <Button size="lg" fullWidth loading={placing} disabled={!quote?.canPlace || quoting || !paymentMethod} onClick={place}>
            {paymentMethod && paymentMethod !== 'COD' ? t('payNow') : t('placeOrder')}
          </Button>
          <p className="text-xs text-ink-500">{t('terms')}</p>
        </Card>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function Choice({ name, checked, onChange, label, hint, aside, disabled }: { name: string; checked: boolean; onChange: () => void; label: string; hint?: string; aside?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors', checked ? 'border-brand-600 bg-brand-50' : 'border-sand-300 hover:border-brand-500', disabled && 'cursor-not-allowed opacity-50')}>
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} className="size-4 accent-brand-600" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-ink-500">{hint}</span>}
      </span>
      {aside}
    </label>
  );
}

function Row({ label, value, tone, small }: { label: string; value: string; tone?: 'success'; small?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-4', small && 'text-xs text-ink-500', tone === 'success' && 'text-success-600')}>
      <dt>{label}</dt>
      <dd className="shrink-0">{value}</dd>
    </div>
  );
}

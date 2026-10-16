'use client';

import { formatDate, type Locale } from '@hudhud/i18n';
import { Alert, Button, Card, Field, SelectField, Spinner, TextAreaField, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePriceFormatter } from '@/components/price';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { pick } from '@/lib/catalog-types';
import type { CheckoutCity, SavedAddress } from '../../checkout/checkout-view';

interface Availability {
  area: { id: string; nameAr: string; nameEn: string } | null;
  fee: number | null;
  days: Array<{ date: string; slots: Array<{ id: string; start: string; end: string; available: boolean }> }>;
}

const localPhone = (e164: string | null | undefined) => (e164 ? e164.replace(/^\+966/, '0') : '');
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');

export function BookingForm({ type, orderId, productId, cities, addresses, user }: { type: 'MEASUREMENT' | 'INSTALLATION'; orderId?: string; productId?: string; cities: CheckoutCity[]; addresses: SavedAddress[]; user: { fullName: string | null; phoneE164: string | null } | null }) {
  const t = useTranslations('services');
  const tc = useTranslations('checkout');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const format = usePriceFormatter();

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [addressId, setAddressId] = useState(defaultAddress?.id ?? '');
  const [form, setForm] = useState({ recipientName: user?.fullName ?? '', phone: localPhone(user?.phoneE164), cityCode: '', districtId: '', street: '', buildingNo: '', postalCode: '', shortAddress: '' });
  const [districts, setDistricts] = useState<Array<{ id: string; nameAr: string; nameEn: string }>>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ key: string; body: string } | null>(null);

  const saved = addresses.find((a) => a.id === addressId);
  const cityCode = saved ? saved.city.code : form.cityCode;
  const city = cities.find((c) => c.code === form.cityCode);
  const districtId = saved ? undefined : form.districtId || undefined;

  useEffect(() => {
    if (!city) return setDistricts([]);
    fetch(`/bff/geo/cities/${city.id}/districts`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDistricts)
      .catch(() => setDistricts([]));
  }, [city]);

  useEffect(() => {
    if (!cityCode) return setAvail(null);
    const ctrl = new AbortController();
    setLoadingSlots(true);
    const qs = new URLSearchParams({ cityCode, type, ...(districtId ? { districtId } : {}), ...(orderId ? { orderId } : {}) });
    fetch(`/bff/services/availability?${qs}`, { signal: ctrl.signal, headers: { 'X-HD-Locale': locale } })
      .then((r) => r.json())
      .then((a: Availability) => {
        setAvail(a);
        setDay(a.days.find((d) => d.slots.some((s) => s.available))?.date ?? null);
        setSlotId(null);
      })
      .catch(() => undefined)
      .finally(() => !ctrl.signal.aborted && setLoadingSlots(false));
    return () => ctrl.abort();
  }, [cityCode, districtId, type, orderId, locale]);

  const addressComplete = saved || (form.recipientName.trim().length >= 2 && form.phone.trim().length >= 9 && form.cityCode && form.street.trim().length >= 3);
  const selectedDay = avail?.days.find((d) => d.date === day);
  const dayLabel = (iso: string) => formatDate(`${iso}T12:00:00+03:00`, { locale, digits: 'western' }, { weekday: 'short', day: 'numeric', month: 'short' });

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const book = async () => {
    if (!slotId || !addressComplete) return;
    const body = {
      type,
      slotId,
      ...(saved
        ? { addressId: saved.id }
        : {
            address: {
              recipientName: form.recipientName.trim(),
              phone: form.phone.trim(),
              cityCode: form.cityCode,
              districtId: form.districtId || undefined,
              street: form.street.trim(),
              buildingNo: form.buildingNo || undefined,
              postalCode: form.postalCode || undefined,
              shortAddress: form.shortAddress || undefined,
            },
          }),
      ...(coords ?? {}),
      notes: notes.trim() || undefined,
      productId,
      orderId,
      paymentMethod: avail?.fee ? 'CARD' : undefined,
      locale,
    };
    const serialized = JSON.stringify(body);
    if (!attempt.current || attempt.current.body !== serialized) attempt.current = { key: newKey(), body: serialized };
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/bff/services/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale, 'Idempotency-Key': attempt.current.key }, body: serialized });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? res.statusText);
      if (json.payment?.redirectUrl) window.location.assign(json.payment.redirectUrl);
      else router.push(`/account/bookings/${json.booking.id}?booked=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const nextUrl = useMemo(() => {
    const qs = new URLSearchParams({ ...(type === 'INSTALLATION' && orderId ? { type, order: orderId } : {}), ...(productId ? { product: productId } : {}) });
    return `${pathname}${qs.size ? `?${qs}` : ''}`;
  }, [pathname, type, orderId, productId]);

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">{t('whereTitle')}</h2>
          {addresses.length > 0 && (
            <SelectField label={tc('savedAddresses')} value={addressId} onChange={(e) => setAddressId(e.target.value)}>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.label || a.recipientName) + ' — ' + pick(locale, a.city.nameAr, a.city.nameEn)}
                </option>
              ))}
              <option value="">{tc('newAddress')}</option>
            </SelectField>
          )}
          {!saved && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tc('recipientName')} value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} autoComplete="name" />
              <Field label={tc('phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" autoComplete="tel" ltr />
              <SelectField label={tc('city')} value={form.cityCode} onChange={(e) => setForm({ ...form, cityCode: e.target.value, districtId: '' })}>
                <option value="">{tc('chooseCity')}</option>
                {cities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {pick(locale, c.nameAr, c.nameEn)}
                  </option>
                ))}
              </SelectField>
              <SelectField label={tc('district')} value={form.districtId} onChange={(e) => setForm({ ...form, districtId: e.target.value })} disabled={!form.cityCode}>
                <option value="">{tc('chooseDistrict')}</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {pick(locale, d.nameAr, d.nameEn)}
                  </option>
                ))}
              </SelectField>
              <div className="sm:col-span-2">
                <Field label={tc('street')} value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} autoComplete="street-address" />
              </div>
              <Field label={tc('buildingNo')} value={form.buildingNo} onChange={(e) => setForm({ ...form, buildingNo: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" ltr />
              <Field label={tc('shortAddress')} hint={tc('shortAddressHint')} value={form.shortAddress} onChange={(e) => setForm({ ...form, shortAddress: e.target.value.toUpperCase().slice(0, 8) })} ltr />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Button type="button" variant="secondary" size="sm" loading={locating} onClick={locate}>
              📍 {t('useLocation')}
            </Button>
            {coords && (
              <a href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`} target="_blank" rel="noopener noreferrer" className="text-success-600 hover:underline">
                {t('locationPinned')}
              </a>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">{t('whenTitle')}</h2>
          {!cityCode && <p className="text-sm text-ink-500">{t('chooseCityFirst')}</p>}
          {loadingSlots && <Spinner className="size-5 text-brand-600" aria-label={t('whenTitle')} />}
          {avail && !avail.area && <Alert>{t('notCovered')}</Alert>}
          {avail?.area && avail.days.length === 0 && <Alert tone="info">{t('noSlots')}</Alert>}
          {avail?.area && avail.days.length > 0 && (
            <>
              <div role="radiogroup" aria-label={t('day')} className="flex gap-2 overflow-x-auto pb-1">
                {avail.days.map((d) => {
                  const any = d.slots.some((s) => s.available);
                  return (
                    <button key={d.date} type="button" role="radio" aria-checked={day === d.date} disabled={!any} onClick={() => (setDay(d.date), setSlotId(null))} className={cn('shrink-0 rounded-xl border px-3 py-2 text-sm', day === d.date ? 'border-brand-600 bg-brand-50 font-medium text-brand-700' : 'border-sand-300 bg-white', !any && 'opacity-40')}>
                      {dayLabel(d.date)}
                    </button>
                  );
                })}
              </div>
              {selectedDay && (
                <div role="radiogroup" aria-label={t('time')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selectedDay.slots.map((s) => (
                    <button key={s.id} type="button" role="radio" aria-checked={slotId === s.id} disabled={!s.available} onClick={() => setSlotId(s.id)} className={cn('rounded-xl border px-3 py-2 text-sm', slotId === s.id ? 'border-brand-600 bg-brand-50 font-medium text-brand-700' : 'border-sand-300 bg-white', !s.available && 'cursor-not-allowed line-through opacity-40')} dir="ltr">
                      {s.start}–{s.end}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <TextAreaField label={t('notes')} hint={t('notesHint')} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} />
        </Card>
      </div>

      <aside>
        <Card className="sticky top-24 flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">{t('summary')}</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt>{t(type === 'INSTALLATION' ? 'typeInstallation' : 'typeMeasurement')}</dt>
              <dd data-testid="visit-fee">{avail?.fee === null || avail?.fee === undefined ? '—' : avail.fee === 0 ? tc('free') : format(avail.fee)}</dd>
            </div>
          </dl>
          {type === 'MEASUREMENT' && <p className="text-xs text-ink-500">{t('feeCredited')}</p>}
          {error && <Alert>{error}</Alert>}
          {user ? (
            <Button size="lg" fullWidth loading={busy} disabled={!slotId || !addressComplete} onClick={book}>
              {avail?.fee ? t('bookAndPay') : t('book')}
            </Button>
          ) : (
            <Link href={`/login?next=${encodeURIComponent(nextUrl)}`} className="inline-flex h-13 items-center justify-center rounded-xl bg-brand-600 px-7 text-lg font-medium text-white hover:bg-brand-700">
              {t('signInToBook')}
            </Link>
          )}
        </Card>
      </aside>
    </div>
  );
}

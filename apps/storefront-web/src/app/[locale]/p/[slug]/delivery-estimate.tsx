'use client';

import { formatDate, type Locale } from '@hudhud/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useCookie, writePreferenceCookie } from '@/lib/client-cookies';

interface Estimate {
  minDays: number;
  maxDays: number;
  from: string;
  to: string;
  productionDays: { min: number; max: number } | null;
  city: { codAllowed: boolean };
}

/** Delivery window for the chosen city (remembered on the device). */
export function DeliveryEstimate({ productId, cities }: { productId: string; cities: Array<{ code: string; nameAr: string; nameEn: string }> }) {
  const t = useTranslations('shop');
  const locale = useLocale() as Locale;
  const saved = useCookie('hd_city');
  const digits = useCookie('hd_digits') === 'arabic_indic' ? 'arabic_indic' : 'western';
  const city = saved && cities.some((c) => c.code === saved) ? saved : '';
  const [estimate, setEstimate] = useState<Estimate | null>(null);

  useEffect(() => {
    if (!city) return setEstimate(null);
    const ctrl = new AbortController();
    fetch(`/bff/delivery-estimate?city=${city}&productId=${productId}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(setEstimate)
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [city, productId]);

  if (cities.length === 0) return null;
  const date = (iso: string) => formatDate(iso, { locale, digits }, { day: 'numeric', month: 'short' });

  return (
    <div className="rounded-card border border-sand-200 bg-white p-4 text-sm">
      <label className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t('deliveryTo')}</span>
        <select value={city} onChange={(e) => writePreferenceCookie('hd_city', e.target.value)} className="h-10 rounded-lg border border-sand-300 bg-white px-2">
          <option value="">{t('chooseCity')}</option>
          {cities.map((c) => (
            <option key={c.code} value={c.code}>
              {locale === 'en' ? c.nameEn : c.nameAr}
            </option>
          ))}
        </select>
      </label>
      {estimate && (
        <div className="mt-3 flex flex-col gap-1 text-ink-700" aria-live="polite">
          <p>{t('deliveryEstimate', { min: estimate.minDays, max: estimate.maxDays, from: date(estimate.from), to: date(estimate.to) })}</p>
          {estimate.productionDays && <p className="text-xs text-ink-500">{t('includesProduction', estimate.productionDays)}</p>}
          {estimate.city.codAllowed && <p className="text-xs text-success-600">{t('codAvailable')}</p>}
        </div>
      )}
    </div>
  );
}

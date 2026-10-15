'use client';

import { Button, Checkbox, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { pick, type FacetDefinition } from '@/lib/catalog-types';
import { usePriceFormatter } from './price';

const SORTS = ['relevance', 'newest', 'price_asc', 'price_desc', 'rating', 'discount'] as const;
const VISIBLE_VALUES = 8;

/** Update the URL query (filters live in the URL so results are shareable and SSR-rendered). */
function useQueryUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const update = (mutate: (qs: URLSearchParams) => void) => {
    const qs = new URLSearchParams(params.toString());
    mutate(qs);
    qs.delete('page'); // any filter change goes back to the first page
    const query = qs.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };
  return { params, update, pending };
}

export function SortSelect({ hasQuery }: { hasQuery: boolean }) {
  const t = useTranslations('shop');
  const { params, update } = useQueryUpdater();
  const current = params.get('sort') ?? (hasQuery ? 'relevance' : 'newest');
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-500">{t('sortBy')}</span>
      <select
        value={current}
        onChange={(e) => update((qs) => qs.set('sort', e.target.value))}
        className="h-10 rounded-xl border border-sand-300 bg-white px-3 text-sm"
      >
        {SORTS.filter((s) => hasQuery || s !== 'relevance').map((s) => (
          <option key={s} value={s}>
            {t(`sort_${s}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function FacetGroup({ facet, counts }: { facet: FacetDefinition; counts: Record<string, number> }) {
  const locale = useLocale();
  const t = useTranslations('shop');
  const { params, update } = useQueryUpdater();
  const [expanded, setExpanded] = useState(false);
  const key = `f.${facet.key}`;
  const selected = new Set((params.get(key) ?? '').split(',').filter(Boolean));
  // Hide values with no matches unless they are selected (keeps the panel relevant).
  const values = facet.values.filter((v) => (counts[v.code] ?? 0) > 0 || selected.has(v.code));
  if (values.length === 0) return null;
  // Swatches are compact, so every colour is shown; text lists collapse after a few values.
  const collapsible = facet.type !== 'COLOR' && values.length > VISIBLE_VALUES;
  const shown = expanded || !collapsible ? values : values.slice(0, VISIBLE_VALUES);

  const toggle = (code: string) =>
    update((qs) => {
      const next = new Set(selected);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      if (next.size) qs.set(key, [...next].join(','));
      else qs.delete(key);
    });

  return (
    <fieldset className="border-b border-sand-200 py-4">
      <legend className="text-sm font-semibold text-ink-900">{pick(locale, facet.nameAr, facet.nameEn)}</legend>
      {facet.type === 'COLOR' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {shown.map((v) => {
            const on = selected.has(v.code);
            const label = pick(locale, v.labelAr, v.labelEn);
            return (
              <button
                key={v.code}
                type="button"
                aria-pressed={on}
                aria-label={`${label} (${counts[v.code] ?? 0})`}
                title={label}
                onClick={() => toggle(v.code)}
                className={cn('size-8 rounded-full border-2 transition', on ? 'border-brand-600 ring-2 ring-brand-100' : 'border-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]')}
                style={{ background: v.swatchHex ?? '#ddd' }}
              />
            );
          })}
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {shown.map((v) => (
            <li key={v.code}>
              <Checkbox
                checked={selected.has(v.code)}
                onChange={() => toggle(v.code)}
                label={
                  <span className="flex gap-1">
                    {pick(locale, v.labelAr, v.labelEn)} <span className="text-ink-500">({counts[v.code] ?? 0})</span>
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}
      {collapsible && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-2 text-sm text-brand-700 hover:underline">
          {expanded ? t('showLess') : t('showMore')}
        </button>
      )}
    </fieldset>
  );
}

function PriceFilter({ range }: { range: { min: number; max: number } | null }) {
  const t = useTranslations('shop');
  const format = usePriceFormatter();
  const { params, update } = useQueryUpdater();
  const toSar = (v: string | null) => (v ? String(Math.round(Number(v) / 100)) : '');
  const [min, setMin] = useState(toSar(params.get('priceMin')));
  const [max, setMax] = useState(toSar(params.get('priceMax')));
  useEffect(() => {
    setMin(toSar(params.get('priceMin')));
    setMax(toSar(params.get('priceMax')));
  }, [params]);
  if (!range) return null;
  const apply = () =>
    update((qs) => {
      const set = (k: string, v: string) => (/^\d+$/.test(v) ? qs.set(k, String(Number(v) * 100)) : qs.delete(k));
      set('priceMin', min);
      set('priceMax', max);
    });
  return (
    <fieldset className="border-b border-sand-200 py-4">
      <legend className="text-sm font-semibold text-ink-900">{t('price')}</legend>
      <p className="mt-1 text-xs text-ink-500">
        {format(range.min)} – {format(range.max)}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" placeholder={t('priceMin')} aria-label={t('priceMin')} className="h-10 w-full rounded-lg border border-sand-300 px-2 text-sm" dir="ltr" />
        <span aria-hidden="true">–</span>
        <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" placeholder={t('priceMax')} aria-label={t('priceMax')} className="h-10 w-full rounded-lg border border-sand-300 px-2 text-sm" dir="ltr" />
        <Button size="sm" variant="secondary" onClick={apply}>
          {t('apply')}
        </Button>
      </div>
    </fieldset>
  );
}

export function FilterPanel({
  facets,
  facetCounts,
  priceRange,
}: {
  facets: FacetDefinition[];
  facetCounts: Record<string, Record<string, number>>;
  priceRange: { min: number; max: number } | null;
}) {
  const t = useTranslations('shop');
  const { params, update, pending } = useQueryUpdater();
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = [...params.keys()].filter((k) => k.startsWith('f.') || k === 'priceMin' || k === 'priceMax' || k === 'inStock').length;

  const panel = (
    <div className={cn('transition-opacity', pending && 'opacity-60')} aria-busy={pending || undefined}>
      <div className="flex items-center justify-between pb-2">
        <h2 className="font-semibold">{t('filters')}</h2>
        {active > 0 && (
          <button type="button" className="text-sm text-brand-700 hover:underline" onClick={() => update((qs) => [...qs.keys()].filter((k) => k.startsWith('f.') || ['priceMin', 'priceMax', 'inStock'].includes(k)).forEach((k) => qs.delete(k)))}>
            {t('clearAll')}
          </button>
        )}
      </div>
      <div className="border-b border-sand-200 py-4">
        <Checkbox label={t('inStockOnly')} checked={params.get('inStock') === 'true'} onChange={(e) => update((qs) => (e.target.checked ? qs.set('inStock', 'true') : qs.delete('inStock')))} />
      </div>
      <PriceFilter range={priceRange} />
      {facets.map((f) => (
        <FacetGroup key={f.key} facet={f} counts={facetCounts[f.key] ?? {}} />
      ))}
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block">{panel}</aside>
      <div className="lg:hidden">
        <Button variant="secondary" size="sm" onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen}>
          {t('showFilters')}
          {active > 0 ? ` (${active})` : ''}
        </Button>
        {mobileOpen && (
          <div role="dialog" aria-modal="true" aria-label={t('filters')} className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-ink-900/40" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 end-0 flex w-[88%] max-w-sm flex-col bg-white">
              <div className="flex-1 overflow-y-auto p-4">{panel}</div>
              <div className="border-t border-sand-200 p-4">
                <Button fullWidth onClick={() => setMobileOpen(false)}>
                  {t('applyFilters')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

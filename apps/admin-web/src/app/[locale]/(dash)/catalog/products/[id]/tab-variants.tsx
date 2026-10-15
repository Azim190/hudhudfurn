'use client';

import { Badge, Button, Card, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { adminCall, halalasToSar, sarToHalalas } from '@/lib/admin-client';
import type { AdminProduct, AdminVariant, Location } from '@/lib/catalog-types';
import type { EditorContext } from './product-editor';

export function VariantsTab({ ctx, locations, canStock }: { ctx: EditorContext; locations: Location[]; canStock: boolean }) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const p = ctx.product;
  const axes = p.categoryAttributes.filter((a) => a.isVariantAxis);
  const label = (x: { labelAr: string; labelEn: string | null }) => (locale === 'en' ? x.labelEn || x.labelAr : x.labelAr);
  const locName = (l: Location) => (locale === 'en' ? l.nameEn || l.nameAr : l.nameAr);

  // Pre-select the values used by active variants.
  const [chosen, setChosen] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(
      axes.map((a) => [a.key, new Set(p.variants.filter((v) => v.isActive).flatMap((v) => v.options.filter((o) => o.attributeKey === a.key).map((o) => o.code)))]),
    ),
  );
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const location = locations.find((l) => l.id === locationId);

  const toggle = (axis: string, code: string) =>
    setChosen((c) => {
      const next = new Set(c[axis]);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { ...c, [axis]: next };
    });

  const generate = () => {
    const selectedAxes = axes
      .filter((a) => chosen[a.key]?.size)
      .map((a) => ({ attributeKey: a.key, valueCodes: a.values.map((v) => v.code).filter((c) => chosen[a.key]!.has(c)) }));
    void ctx.mutate(async () => {
      const res = await adminCall<{ created: number; deactivated: number; product: AdminProduct }>(`/products/${p.id}/variants/generate`, 'POST', { axes: selectedAxes }, locale);
      return res.product;
    }, t('saved'));
  };

  const variants = [...p.variants].sort((a, b) => Number(b.isActive) - Number(a.isActive));

  return (
    <div className="flex flex-col gap-6">
      {axes.length === 0 ? (
        <p className="text-sm text-ink-500">{t('noVariantAxes')}</p>
      ) : (
        ctx.canWrite && (
          <Card className="flex flex-col gap-4 p-5">
            <div>
              <h2 className="font-semibold">{t('variantAxes')}</h2>
              <p className="mt-1 text-sm text-ink-500">{t('generateHint')}</p>
            </div>
            {axes.map((a) => (
              <fieldset key={a.key}>
                <legend className="mb-2 text-sm font-medium text-ink-700">{locale === 'en' ? a.nameEn || a.nameAr : a.nameAr}</legend>
                <div className="flex flex-wrap gap-2">
                  {a.values.map((v) => {
                    const on = chosen[a.key]?.has(v.code) ?? false;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(a.key, v.code)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm',
                          on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-sand-300 bg-white text-ink-700',
                        )}
                      >
                        {v.swatchHex && <span className="size-3.5 rounded-full border border-black/10" style={{ background: v.swatchHex }} />}
                        {label(v)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <div>
              <Button onClick={generate} loading={ctx.busy}>
                {t('generateVariants')}
              </Button>
            </div>
          </Card>
        )
      )}

      {canStock && locations.length > 1 && (
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          aria-label={t('stock')}
          className="h-10 max-w-sm rounded-xl border border-sand-300 bg-white px-3 text-sm"
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {locName(l)}
            </option>
          ))}
        </select>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-sand-200 text-xs text-ink-500">
            <tr>
              {[t('sku'), t('variantAxes'), t('variantPrice'), t('compareAtPrice'), t('active'), t('available')].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 text-start font-medium">
                  {h}
                </th>
              ))}
              {canStock && location && (
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('onHand', { location: locName(location) })}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <VariantRow key={`${v.id}-${locationId}`} variant={v} ctx={ctx} locationId={canStock ? locationId : undefined} madeToMeasure={p.isMadeToMeasure} />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function VariantRow({ variant: v, ctx, locationId, madeToMeasure }: { variant: AdminVariant; ctx: EditorContext; locationId?: string; madeToMeasure: boolean }) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const [price, setPrice] = useState(halalasToSar(v.price));
  const [compareAt, setCompareAt] = useState(halalasToSar(v.compareAtPrice));
  const currentStock = v.stock.find((s) => s.locationId === locationId)?.onHand ?? 0;
  const [stock, setStock] = useState(String(currentStock));
  const dirty = price !== halalasToSar(v.price) || compareAt !== halalasToSar(v.compareAtPrice);
  const options = v.options.map((o) => (locale === 'en' ? o.labelEn || o.labelAr : o.labelAr)).join(' · ');
  const patch = (body: Record<string, unknown>) => ctx.mutate(() => adminCall<AdminProduct>(`/variants/${v.id}`, 'PATCH', body, locale));

  return (
    <tr className={cn('border-b border-sand-100 last:border-0', !v.isActive && 'opacity-50')}>
      <td className="px-4 py-2.5 font-mono text-xs" dir="ltr">
        <span className="block text-start">{v.sku}</span>
      </td>
      <td className="px-4 py-2.5">
        {options || '—'} {v.isDefault && <Badge className="ms-1">{t('defaultVariant')}</Badge>}
      </td>
      <td className="px-4 py-2.5">
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={t('basePlaceholder')}
          inputMode="decimal"
          dir="ltr"
          aria-label={`${t('variantPrice')} ${v.sku}`}
          disabled={!ctx.canWrite}
          className="h-9 w-24 rounded-lg border border-sand-300 px-2"
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <input
            value={compareAt}
            onChange={(e) => setCompareAt(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            aria-label={`${t('compareAtPrice')} ${v.sku}`}
            disabled={!ctx.canWrite}
            className="h-9 w-24 rounded-lg border border-sand-300 px-2"
          />
          {dirty && (
            <Button size="sm" disabled={ctx.busy} onClick={() => patch({ price: sarToHalalas(price), compareAtPrice: sarToHalalas(compareAt) })}>
              {t('save')}
            </Button>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <input
          type="checkbox"
          className="size-4 accent-brand-600"
          checked={v.isActive}
          disabled={!ctx.canWrite || ctx.busy}
          aria-label={`${t('active')} ${v.sku}`}
          onChange={(e) => patch({ isActive: e.target.checked })}
        />
      </td>
      <td className="px-4 py-2.5">{madeToMeasure ? '∞' : v.available}</td>
      {locationId && (
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <input
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              aria-label={`${t('stock')} ${v.sku}`}
              className="h-9 w-20 rounded-lg border border-sand-300 px-2"
            />
            {stock !== String(currentStock) && (
              <Button
                size="sm"
                disabled={ctx.busy || !/^\d+$/.test(stock)}
                onClick={() =>
                  ctx.mutate(async () => {
                    await adminCall(`/variants/${v.id}/stock`, 'PUT', { locationId, onHand: Number(stock) }, locale);
                    return adminCall<AdminProduct>(`/products/${ctx.product.id}`, 'GET', undefined, locale);
                  }, t('saved'))
                }
              >
                {t('setStock')}
              </Button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

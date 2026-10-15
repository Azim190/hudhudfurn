'use client';

import { Button, Spinner } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { Price } from '@/components/price';
import { useProductCards } from '@/components/recently-viewed';
import { ResponsiveImage } from '@/components/responsive-image';
import { Link } from '@/i18n/navigation';
import { pick, type ProductCard } from '@/lib/catalog-types';
import { clearCompare, toggleCompare, useCompare } from '@/lib/shop-store';

type CompareCard = ProductCard & { attributes: Array<{ key: string; nameAr: string; nameEn: string | null; labelAr: string; labelEn: string | null }> };

export function CompareView() {
  const t = useTranslations('shop');
  const locale = useLocale();
  const ids = useCompare();
  const cards = useProductCards(ids) as CompareCard[] | null;

  if (cards === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-8 text-brand-600" />
      </div>
    );
  }
  if (cards.length === 0) return <p className="py-16 text-center text-ink-500">{t('compareEmpty')}</p>;

  // Union of attribute names across the compared products, in first-seen order.
  const rows = new Map<string, { name: string; values: Map<string, string[]> }>();
  for (const c of cards) {
    for (const a of c.attributes) {
      const row = rows.get(a.key) ?? { name: pick(locale, a.nameAr, a.nameEn), values: new Map<string, string[]>() };
      row.values.set(c.id, [...(row.values.get(c.id) ?? []), pick(locale, a.labelAr, a.labelEn)]);
      rows.set(a.key, row);
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={clearCompare}>
          {t('clearAll')}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-card bg-white shadow-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-40 p-4 text-start text-ink-500">
                {t('attribute')}
              </th>
              {cards.map((c) => (
                <th key={c.id} scope="col" className="p-4 text-start align-top font-normal">
                  <Link href={`/p/${encodeURIComponent(locale === 'en' ? c.slugEn : c.slugAr)}`} className="block">
                    {c.image && <ResponsiveImage media={c.image} alt="" sizes="200px" className="aspect-[4/5] w-full rounded-lg object-cover" />}
                    <span className="mt-2 block font-medium text-ink-900">{pick(locale, c.nameAr, c.nameEn)}</span>
                  </Link>
                  <button type="button" onClick={() => toggleCompare(c.id)} className="mt-1 text-xs text-ink-500 hover:text-danger-600">
                    {t('removeFromCompare')}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-sand-200">
              <th scope="row" className="p-4 text-start font-medium text-ink-500">
                {t('price')}
              </th>
              {cards.map((c) => (
                <td key={c.id} className="p-4">
                  <Price amount={c.price} compareAt={c.compareAtPrice} size="sm" />
                </td>
              ))}
            </tr>
            <tr className="border-t border-sand-200">
              <th scope="row" className="p-4 text-start font-medium text-ink-500">
                {t('inStock')}
              </th>
              {cards.map((c) => (
                <td key={c.id} className="p-4">
                  {c.isMadeToMeasure ? t('madeToMeasure') : c.inStock ? t('inStock') : t('outOfStock')}
                </td>
              ))}
            </tr>
            {[...rows.values()].map((row) => (
              <tr key={row.name} className="border-t border-sand-200">
                <th scope="row" className="p-4 text-start font-medium text-ink-500">
                  {row.name}
                </th>
                {cards.map((c) => (
                  <td key={c.id} className="p-4">
                    {row.values.get(c.id)?.join('، ') ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

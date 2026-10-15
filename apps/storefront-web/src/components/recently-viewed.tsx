'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ProductCard as Card } from '@/lib/catalog-types';
import { useRecentlyViewed } from '@/lib/shop-store';
import { ProductCard } from './product-card';

/** Shared hook: load cards for a list of product ids (order preserved). */
export function useProductCards(ids: string[]) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    if (!key) return setCards([]);
    const ctrl = new AbortController();
    fetch(`/bff/products/cards?ids=${key}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then(setCards)
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [key]);
  return cards;
}

export function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const t = useTranslations('shop');
  const ids = useRecentlyViewed().filter((id) => id !== excludeId).slice(0, 8);
  const cards = useProductCards(ids);
  if (!cards || cards.length === 0) return null;
  return (
    <section aria-labelledby="recent" className="mt-16">
      <h2 id="recent" className="mb-6 text-2xl font-semibold">
        {t('recentlyViewed')}
      </h2>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4">
        {cards.slice(0, 4).map((p) => (
          <li key={p.id}>
            <ProductCard product={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}

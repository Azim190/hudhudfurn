'use client';

import { cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { pick } from '@/lib/catalog-types';
import { usePriceFormatter } from './price';

interface Suggestion {
  id: string;
  slugAr: string;
  slugEn: string;
  nameAr: string;
  nameEn: string | null;
  image: string | null;
  price: number;
}

/** Search box with instant suggestions (ARIA combobox pattern). */
export function HeaderSearch({ className }: { className?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const format = usePriceFormatter();
  const listId = useId();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/bff/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { products: Suggestion[] };
        setItems(data.products ?? []);
        setActive(-1);
        setOpen(true);
      } catch {
        // Aborted or offline: keep the previous suggestions.
      }
    }, 180);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (s: Suggestion) => {
    setOpen(false);
    router.push(`/p/${encodeURIComponent(locale === 'en' ? s.slugEn : s.slugAr)}`);
  };
  const submit = () => {
    if (!q.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && items[active]) go(items[active]!);
      else submit();
    } else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={box} className={cn('relative', className)}>
      <form role="search" onSubmit={(e) => (e.preventDefault(), submit())}>
        <input
          type="search"
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={t('common.search')}
          placeholder={t('common.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={onKey}
          enterKeyHint="search"
          className="h-10 w-full rounded-full border border-sand-300 bg-white ps-10 pe-4 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
        <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 fill-none stroke-ink-500" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      </form>
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" aria-label={t('shop.suggestions')} className="absolute inset-x-0 top-12 z-40 overflow-hidden rounded-xl border border-sand-200 bg-white shadow-card">
          {items.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => (e.preventDefault(), go(s))}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center gap-3 px-3 py-2', i === active && 'bg-sand-100')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 320px rendition */}
              {s.image ? <img src={s.image} alt="" width={36} height={45} className="h-11 w-9 rounded object-cover" /> : <span className="h-11 w-9 rounded bg-sand-100" />}
              <span className="flex-1 text-sm">{pick(locale, s.nameAr, s.nameEn)}</span>
              <span className="text-xs text-ink-500">{format(s.price)}</span>
            </li>
          ))}
          <li role="option" aria-selected={false} onMouseDown={(e) => (e.preventDefault(), submit())} className="cursor-pointer border-t border-sand-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-sand-50">
            {t('shop.viewAllResults')}
          </li>
        </ul>
      )}
    </div>
  );
}

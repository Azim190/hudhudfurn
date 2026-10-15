'use client';

import { ChevronForward, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { pick, type CategoryNode } from '@/lib/catalog-types';

const slugOf = (locale: string, c: { slugAr: string; slugEn: string }) => encodeURIComponent(locale === 'en' ? c.slugEn : c.slugAr);

/** Desktop mega menu: one panel per top-level category, opened on hover or keyboard focus. */
export function MegaMenu({ tree }: { tree: CategoryNode[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setOpen(null), [pathname]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    const onClick = (e: MouseEvent) => !nav.current?.contains(e.target as Node) && setOpen(null);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const hover = (id: string | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(id), id ? 80 : 150);
  };

  return (
    <nav ref={nav} aria-label={t('a11y.mainNavigation')} className="hidden lg:block" onMouseLeave={() => hover(null)}>
      <ul className="flex items-center gap-1">
        {tree.map((c) => (
          <li key={c.id} onMouseEnter={() => hover(c.id)}>
            <button
              type="button"
              aria-expanded={open === c.id}
              aria-controls={`mega-${c.id}`}
              onClick={() => setOpen(open === c.id ? null : c.id)}
              className={cn('rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-ink-700 hover:bg-sand-100', open === c.id && 'bg-sand-100 text-ink-900')}
            >
              {pick(locale, c.nameAr, c.nameEn)}
            </button>
            {open === c.id && (
              <div id={`mega-${c.id}`} className="absolute inset-x-0 top-full z-30 border-b border-sand-200 bg-white shadow-card">
                <div className="mx-auto grid max-w-7xl grid-cols-[1fr_280px] gap-8 px-6 py-8">
                  <div>
                    <Link href={`/c/${slugOf(locale, c)}`} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                      {t('shop.allInCategory', { name: pick(locale, c.nameAr, c.nameEn) })}
                      <ChevronForward className="size-4" />
                    </Link>
                    <ul className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 xl:grid-cols-3">
                      {c.children.map((child) => (
                        <li key={child.id}>
                          <Link href={`/c/${slugOf(locale, child)}`} className="text-sm text-ink-700 hover:text-brand-700">
                            {pick(locale, child.nameAr, child.nameEn)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {c.imageUrl && (
                    <Link href={`/c/${slugOf(locale, c)}`} className="block overflow-hidden rounded-card bg-sand-100" tabIndex={-1} aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element -- category thumbnail rendition */}
                      <img src={c.imageUrl} alt="" width={280} height={350} className="aspect-[4/5] w-full object-cover" />
                    </Link>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Mobile drawer with an accordion per top-level category. */
export function MobileMenu({ tree }: { tree: CategoryNode[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button type="button" aria-label={t('a11y.openMenu')} aria-expanded={open} onClick={() => setOpen(true)} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-sand-100">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 fill-none stroke-ink-900" strokeWidth="2">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={t('nav.menu')} className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 flex w-[85%] max-w-sm flex-col overflow-y-auto bg-white">
            <div className="flex items-center justify-between border-b border-sand-200 px-4 py-3">
              <span className="text-lg font-bold text-brand-700">{t('common.storeName')}</span>
              <button type="button" aria-label={t('a11y.closeMenu')} onClick={() => setOpen(false)} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-sand-100">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 fill-none stroke-ink-900" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <ul className="flex-1 px-2 py-2">
              {tree.map((c) => (
                <li key={c.id} className="border-b border-sand-100">
                  <button
                    type="button"
                    aria-expanded={section === c.id}
                    onClick={() => setSection(section === c.id ? null : c.id)}
                    className="flex w-full items-center justify-between px-3 py-3 text-start font-medium"
                  >
                    {pick(locale, c.nameAr, c.nameEn)}
                    <ChevronForward className={cn('size-4 transition', section === c.id && 'rotate-90')} />
                  </button>
                  {section === c.id && (
                    <ul className="pb-3 ps-4">
                      <li>
                        <Link href={`/c/${slugOf(locale, c)}`} className="block px-3 py-2 text-sm font-medium text-brand-700">
                          {t('shop.allInCategory', { name: pick(locale, c.nameAr, c.nameEn) })}
                        </Link>
                      </li>
                      {c.children.map((child) => (
                        <li key={child.id}>
                          <Link href={`/c/${slugOf(locale, child)}`} className="block px-3 py-2 text-sm text-ink-700">
                            {pick(locale, child.nameAr, child.nameEn)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { ChevronBack, ChevronForward, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ResponsiveImage } from '@/components/responsive-image';
import { pick, type ProductDetail } from '@/lib/catalog-types';

type Item = ProductDetail['media'][number];

/** Main image with hover zoom (desktop), thumbnails, keyboard navigation and a full-screen view. */
export function ProductGallery({ media, productName, selectedVariantId }: { media: Item[]; productName: string; selectedVariantId?: string }) {
  const t = useTranslations('shop');
  const locale = useLocale();
  const rtl = locale === 'ar';
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  // Follow the selected colour: show its image when it has one.
  useEffect(() => {
    const i = media.findIndex((m) => m.variantId === selectedVariantId);
    if (i >= 0) setIndex(i);
  }, [selectedVariantId, media]);
  useEffect(() => {
    if (fullscreen) dialog.current?.focus();
  }, [fullscreen]);

  if (media.length === 0) return <div className="aspect-[4/5] rounded-card bg-sand-100" />;
  const current = media[Math.min(index, media.length - 1)]!;
  const alt = (m: Item) => pick(locale, m.altAr, m.altEn) || productName;
  const step = (delta: number) => setIndex((i) => (i + delta + media.length) % media.length);

  // Arrow keys follow the reading direction.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') step(rtl ? -1 : 1);
    if (e.key === 'ArrowLeft') step(rtl ? 1 : -1);
    if (e.key === 'Escape') setFullscreen(false);
  };
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  return (
    <section aria-label={t('gallery')} className="flex flex-col gap-3 lg:flex-row-reverse" onKeyDown={onKey}>
      <div className="relative flex-1">
        <button
          type="button"
          aria-label={`${t('zoom')}: ${alt(current)}`}
          onClick={() => setFullscreen(true)}
          className="block w-full cursor-zoom-in overflow-hidden rounded-card bg-sand-100"
        >
          <div onMouseMove={onMove} onMouseLeave={() => setZoom(null)} className="aspect-[4/5] overflow-hidden">
            <div
              className="size-full transition-transform duration-200"
              style={zoom ? { transform: 'scale(1.8)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            >
              <ResponsiveImage media={current} alt={alt(current)} sizes="(min-width: 1024px) 50vw, 100vw" priority className="size-full object-cover" />
            </div>
          </div>
        </button>
        {media.length > 1 && (
          <>
            <button type="button" aria-label={t('previousSlide')} onClick={() => step(-1)} className="absolute start-3 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow lg:hidden">
              <ChevronBack />
            </button>
            <button type="button" aria-label={t('nextSlide')} onClick={() => step(1)} className="absolute end-3 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow lg:hidden">
              <ChevronForward />
            </button>
          </>
        )}
        <p className="sr-only" aria-live="polite">
          {t('imageOf', { index: index + 1, total: media.length })}
        </p>
      </div>
      {media.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto lg:w-20 lg:flex-col">
          {media.map((m, i) => (
            <li key={m.id} className="shrink-0">
              <button
                type="button"
                aria-label={t('imageOf', { index: i + 1, total: media.length })}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cn('block overflow-hidden rounded-lg border-2', i === index ? 'border-brand-600' : 'border-transparent opacity-80 hover:opacity-100')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail rendition */}
                <img src={m.thumbnailUrl} alt="" width={80} height={100} className="h-24 w-20 object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {fullscreen && (
        <div ref={dialog} role="dialog" aria-modal="true" aria-label={t('gallery')} tabIndex={-1} onKeyDown={onKey} className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/90 p-4 outline-none">
          <button type="button" onClick={() => setFullscreen(false)} aria-label={t('close')} className="absolute end-4 top-4 inline-flex size-11 items-center justify-center rounded-full bg-white/90 text-xl">
            ×
          </button>
          {media.length > 1 && (
            <button type="button" aria-label={t('previousSlide')} onClick={() => step(-1)} className="absolute start-4 inline-flex size-11 items-center justify-center rounded-full bg-white/90">
              <ChevronBack />
            </button>
          )}
          <ResponsiveImage media={current} alt={alt(current)} sizes="100vw" className="max-h-full w-auto max-w-full object-contain" />
          {media.length > 1 && (
            <button type="button" aria-label={t('nextSlide')} onClick={() => step(1)} className="absolute end-4 inline-flex size-11 items-center justify-center rounded-full bg-white/90">
              <ChevronForward />
            </button>
          )}
        </div>
      )}
    </section>
  );
}

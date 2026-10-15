'use client';

import { ChevronBack, ChevronForward, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { pick, type Banner } from '@/lib/catalog-types';
import { ResponsiveImage } from './responsive-image';

const AUTOPLAY_MS = 6000;

/** Admin-managed hero banners. Each language has its own artwork; autoplay pauses on hover/focus. */
export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const t = useTranslations('shop');
  const locale = useLocale();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;

  useEffect(() => {
    if (count < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [count, paused]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t('shopCollection')}
      className="relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {banners.map((b, i) => {
        const image = locale === 'en' ? b.imageEn ?? b.imageAr : b.imageAr ?? b.imageEn;
        const cta = pick(locale, b.ctaAr, b.ctaEn) || t('shopCollection');
        return (
          <div key={b.id} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${count}`} hidden={i !== index} className="relative">
            <div className="relative aspect-[16/7] min-h-80 w-full bg-gradient-to-b from-brand-50 to-sand-50 sm:aspect-[16/6]">
              {image && <ResponsiveImage media={image} alt="" sizes="100vw" priority={i === 0} className="absolute inset-0 size-full object-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-ink-900/50 via-ink-900/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-4 pb-10 sm:px-6 sm:pb-14">
                <h2 className={cn('max-w-2xl text-3xl font-bold sm:text-5xl', image ? 'text-white' : 'text-ink-900')}>{pick(locale, b.titleAr, b.titleEn)}</h2>
                {pick(locale, b.subtitleAr, b.subtitleEn) && <p className={cn('mt-3 max-w-xl text-lg', image ? 'text-white/90' : 'text-ink-700')}>{pick(locale, b.subtitleAr, b.subtitleEn)}</p>}
                {b.link && (
                  <Link href={b.link} className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 font-medium text-ink-900 hover:bg-sand-100">
                    {cta}
                    <ChevronForward />
                  </Link>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {count > 1 && (
        <>
          <button type="button" aria-label={t('previousSlide')} onClick={() => setIndex((i) => (i - 1 + count) % count)} className="absolute start-4 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow">
            <ChevronBack />
          </button>
          <button type="button" aria-label={t('nextSlide')} onClick={() => setIndex((i) => (i + 1) % count)} className="absolute end-4 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow">
            <ChevronForward />
          </button>
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
            {banners.map((b, i) => (
              <button key={b.id} type="button" aria-label={t('goToSlide', { index: i + 1 })} aria-current={i === index} onClick={() => setIndex(i)} className={cn('h-2 rounded-full transition-all', i === index ? 'w-6 bg-white' : 'w-2 bg-white/60')} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

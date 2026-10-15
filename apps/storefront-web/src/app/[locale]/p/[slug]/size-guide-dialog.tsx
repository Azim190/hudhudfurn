'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { pick, type ProductDetail } from '@/lib/catalog-types';

/** Size guide in a native <dialog> (focus trap, Escape and backdrop handled by the browser). */
export function SizeGuideDialog({ guide }: { guide: NonNullable<ProductDetail['sizeGuide']> }) {
  const t = useTranslations('shop');
  const locale = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    const onClick = (e: MouseEvent) => e.target === d && d?.close();
    d?.addEventListener('click', onClick);
    return () => d?.removeEventListener('click', onClick);
  }, []);
  const title = pick(locale, guide.titleAr, guide.titleEn);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="self-start text-sm font-medium text-brand-700 underline underline-offset-4">
        {t('sizeGuide')}
      </button>
      <dialog ref={ref} aria-label={title} className="m-auto w-[min(640px,92vw)] rounded-card p-0 shadow-card backdrop:bg-ink-900/50">
        <div className="flex items-center justify-between border-b border-sand-200 px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label={t('close')} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-sand-100">
            ×
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sand-100">
                {guide.table.columns.map((c, i) => (
                  <th key={i} scope="col" className="px-3 py-2 text-start font-medium">
                    {pick(locale, c.ar, c.en)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {guide.table.rows.map((row, i) => (
                <tr key={i} className="border-b border-sand-200">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {pick(locale, guide.howToMeasureAr, guide.howToMeasureEn) && (
            <div className="mt-5">
              <h3 className="font-medium">{t('howToMeasure')}</h3>
              <p className="mt-1 text-sm text-ink-700">{pick(locale, guide.howToMeasureAr, guide.howToMeasureEn)}</p>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

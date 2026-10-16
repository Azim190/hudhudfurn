import { useLocale, useTranslations } from 'next-intl';
import { pick } from '@/lib/catalog-types';

export interface ConfigurationInfo {
  kind?: string;
  specs: Record<string, number | string>;
  choices?: Array<{ group: string; code: string; nameAr: string; nameEn: string }>;
}

const cm = (mm: unknown) => Math.round(Number(mm) / 10);

/** One-line description of a made-to-measure configuration (cart, checkout, order pages). */
export function ConfigurationSummary({ configuration, className }: { configuration: ConfigurationInfo; className?: string }) {
  const t = useTranslations('configurator');
  const locale = useLocale();
  const s = configuration.specs;
  const kind = configuration.kind || String(s.kind ?? '');
  const parts: string[] = [];
  if ((kind === 'CURTAIN' || kind === 'BLIND') && s.widthMm && s.heightMm) parts.push(t('summarySize', { width: cm(s.widthMm), height: cm(s.heightMm) }));
  if (kind === 'CURTAIN' && s.panels) parts.push(t('summaryPanels', { count: Number(s.panels) }));
  if (kind === 'ABAYA' && s.lengthMm) parts.push(t('summaryMeasurements', { length: cm(s.lengthMm), chest: cm(s.chestMm), shoulder: cm(s.shoulderMm), sleeve: cm(s.sleeveMm) }));
  if (kind === 'SOFA_COVER' && s.pieceCount) parts.push(t('summaryPieces', { count: Number(s.pieceCount) }));
  for (const c of configuration.choices ?? []) parts.push(pick(locale, c.nameAr, c.nameEn));
  return (
    <p className={className ?? 'text-sm text-ink-500'} data-testid="configuration-summary">
      {parts.join(' · ')}
      {s.notes ? <span className="block text-xs italic">“{String(s.notes)}”</span> : null}
    </p>
  );
}

'use client';

import { Card } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

export interface Profile {
  id: string;
  label: string;
  measurements: Record<string, number>;
}

const cm = (mm: number | undefined) => (mm ? Math.round(mm / 10) : '—');

export function MeasurementList({ initial }: { initial: Profile[] }) {
  const t = useTranslations('configurator');
  const tc = useTranslations('shop');
  const locale = useLocale();
  const [profiles, setProfiles] = useState(initial);

  const remove = async (id: string) => {
    const res = await fetch(`/bff/me/measurement-profiles/${id}`, { method: 'DELETE', headers: { 'X-HD-Locale': locale } });
    if (res.ok) setProfiles((p) => p.filter((x) => x.id !== id));
  };

  if (profiles.length === 0) return <Card className="mt-8 p-8 text-center text-ink-500">{t('noProfiles')}</Card>;
  return (
    <ul className="mt-8 flex flex-col gap-3">
      {profiles.map((p) => (
        <li key={p.id}>
          <Card className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{p.label}</p>
              <p className="text-sm text-ink-500">{t('summaryMeasurements', { length: cm(p.measurements.length), chest: cm(p.measurements.chest), shoulder: cm(p.measurements.shoulder), sleeve: cm(p.measurements.sleeve) })}</p>
            </div>
            <button type="button" onClick={() => remove(p.id)} className="text-sm text-ink-500 hover:text-danger-600">
              {tc('remove')}
            </button>
          </Card>
        </li>
      ))}
    </ul>
  );
}

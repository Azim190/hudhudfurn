'use client';

import { formatDate, type Locale } from '@hudhud/i18n';
import { Alert, Button, Card, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';

type Days = Array<{ date: string; slots: Array<{ id: string; start: string; end: string; available: boolean }> }>;

export function BookingActions({ bookingId, cityCode, type }: { bookingId: string; cityCode: string; type: 'MEASUREMENT' | 'INSTALLATION' }) {
  const t = useTranslations('services');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [days, setDays] = useState<Days | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const post = async (action: 'cancel' | 'reschedule', body: object) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/bff/services/bookings/${bookingId}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? res.statusText);
      setDays(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const loadSlots = async () => {
    const res = await fetch(`/bff/services/availability?${new URLSearchParams({ cityCode, type })}`, { headers: { 'X-HD-Locale': locale } });
    if (res.ok) setDays(((await res.json()) as { days: Days }).days);
  };

  return (
    <Card className="mt-6 flex flex-col gap-3 p-5">
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={loadSlots} disabled={Boolean(busy)}>
          {t('reschedule')}
        </Button>
        <Button variant="danger" loading={busy === 'cancel'} disabled={Boolean(busy)} onClick={() => window.confirm(t('confirmCancel')) && post('cancel', {})}>
          {t('cancelVisit')}
        </Button>
      </div>
      {days && (
        <div className="flex flex-col gap-3">
          {days.map((d) => (
            <div key={d.date}>
              <p className="text-sm font-medium">{formatDate(`${d.date}T12:00:00+03:00`, { locale, digits: 'western' }, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
              <div role="radiogroup" className="mt-1 flex flex-wrap gap-2">
                {d.slots.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={slotId === s.id} disabled={!s.available} onClick={() => setSlotId(s.id)} className={cn('rounded-lg border px-3 py-1.5 text-sm', slotId === s.id ? 'border-brand-600 bg-brand-50' : 'border-sand-300', !s.available && 'opacity-40')} dir="ltr">
                    {s.start}–{s.end}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <Button className="self-start" disabled={!slotId} loading={busy === 'reschedule'} onClick={() => slotId && post('reschedule', { slotId })}>
            {t('confirmNewTime')}
          </Button>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      <p className="text-xs text-ink-500">{t('changePolicy')}</p>
    </Card>
  );
}

'use client';

import { Alert, Button, Field } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { adminCall } from '@/lib/admin-client';

export function OrderOperations({ orderId, nextStatuses, canUpdate, canCancel, canSync }: { orderId: string; nextStatuses: Array<{ status: string; label: string }>; canUpdate: boolean; canCancel: boolean; canSync: boolean }) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const router = useRouter();
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    setDone(false);
    try {
      await fn();
      setNote('');
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (!canUpdate && !canCancel) return null;
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-card bg-white p-5 shadow-card">
      {canUpdate && nextStatuses.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <Field label={t('statusNote')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
          {nextStatuses.map((s) => (
            <Button key={s.status} loading={busy === s.status} disabled={Boolean(busy)} onClick={() => run(s.status, () => adminCall(`/orders/${orderId}/status`, 'POST', { status: s.status, note: note.trim() || undefined }, locale))}>
              {s.label}
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        {canSync && (
          <Button variant="secondary" loading={busy === 'sync'} disabled={Boolean(busy)} onClick={() => run('sync', () => adminCall(`/orders/${orderId}/payment/sync`, 'POST', {}, locale))}>
            {t('syncPayment')}
          </Button>
        )}
        {canCancel && (
          <>
            <div className="min-w-60 flex-1">
              <Field label={t('cancelReason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </div>
            <Button
              variant="danger"
              loading={busy === 'cancel'}
              disabled={Boolean(busy) || reason.trim().length < 2}
              onClick={() => window.confirm(t('confirmCancelOrder')) && run('cancel', () => adminCall(`/orders/${orderId}/cancel`, 'POST', { reason: reason.trim() }, locale))}
            >
              {t('cancelAndRefund')}
            </Button>
          </>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {done && <Alert tone="success">{t('updated')}</Alert>}
    </div>
  );
}

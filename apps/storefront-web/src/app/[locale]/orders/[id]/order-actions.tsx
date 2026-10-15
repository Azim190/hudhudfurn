'use client';

import { Alert, Button } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';

export function OrderActions({ orderId, canRetryPayment, canCancel }: { orderId: string; canRetryPayment: boolean; canCancel: boolean }) {
  const t = useTranslations('orders');
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<'pay' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const post = async (action: 'pay' | 'cancel') => {
    if (action === 'cancel' && !window.confirm(t('confirmCancel'))) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/bff/orders/${orderId}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale }, body: '{}' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? res.statusText);
      if (action === 'pay') return window.location.assign(json.redirectUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (!canRetryPayment && !canCancel) return null;
  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {canRetryPayment && (
          <Button loading={busy === 'pay'} onClick={() => post('pay')}>
            {t('retryPayment')}
          </Button>
        )}
        {canCancel && (
          <Button variant="secondary" loading={busy === 'cancel'} onClick={() => post('cancel')}>
            {t('cancelOrder')}
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

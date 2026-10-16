'use client';

import { Alert, Button, Card, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

export function AcceptQuotation({ number, methods }: { number: string; methods: Array<'CARD' | 'TABBY' | 'TAMARA'> }) {
  const t = useTranslations('services');
  const tc = useTranslations('checkout');
  const locale = useLocale();
  const [method, setMethod] = useState(methods[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (!method) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/bff/quotations/${number}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale }, body: JSON.stringify({ paymentMethod: method }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? res.statusText);
      window.location.assign(json.redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Card className="mt-6 flex flex-col gap-3 p-5">
      <h2 className="text-lg font-semibold">{tc('payment')}</h2>
      <div role="radiogroup" aria-label={tc('payment')} className="flex flex-col gap-2">
        {methods.map((m) => (
          <label key={m} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3', method === m ? 'border-brand-600 bg-brand-50' : 'border-sand-300')}>
            <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} className="size-4 accent-brand-600" />
            {tc(`method_${m}`)}
          </label>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      <Button size="lg" loading={busy} disabled={!method} onClick={accept}>
        {t('acceptAndPay')}
      </Button>
    </Card>
  );
}

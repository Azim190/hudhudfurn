'use client';

import { Alert, Button, Card, Spinner } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';

interface VerifiedOrder {
  id: string;
  status: string;
  paymentState: string;
  expiresAt: string | null;
  canRetryPayment: boolean;
  payment: { status: string; failureReason: string | null } | null;
}

const POLL_MS = 2000;
const MAX_POLLS = 10;

export function PaymentReturn({ orderId }: { orderId: string }) {
  const t = useTranslations('checkout');
  const locale = useLocale();
  const router = useRouter();
  const [order, setOrder] = useState<VerifiedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let polls = 0;
    const check = async () => {
      try {
        const res = await fetch(`/bff/orders/${orderId}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale }, body: '{}' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? res.statusText);
        if (cancelled) return;
        const o = json as VerifiedOrder;
        if (o.paymentState !== 'UNPAID' || o.status !== 'NEW') return router.replace(`/orders/${orderId}?placed=1`);
        const pending = o.payment?.status === 'PENDING' || o.payment?.status === 'AUTHORIZED';
        if (pending && ++polls < MAX_POLLS) setTimeout(check, POLL_MS);
        else setOrder(o);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [orderId, locale, router]);

  const retry = async () => {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/bff/orders/${orderId}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale }, body: '{}' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? res.statusText);
      window.location.assign(json.redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRetrying(false);
    }
  };

  if (error) return <Alert className="mt-6">{error}</Alert>;
  if (!order) {
    return (
      <div className="mt-8 flex items-center gap-3 text-ink-700" role="status">
        <Spinner className="size-6 text-brand-600" />
        {t('returnPending')}
      </div>
    );
  }
  const minutes = order.expiresAt ? Math.max(1, Math.round((new Date(order.expiresAt).getTime() - Date.now()) / 60_000)) : 30;
  return (
    <Card className="mt-6 flex flex-col gap-4 p-6">
      <Alert>{t('paymentFailed')}</Alert>
      <p className="text-sm text-ink-700">{t('paymentFailedHint', { minutes })}</p>
      {order.payment?.failureReason && <p className="text-xs text-ink-500" dir="auto">{order.payment.failureReason}</p>}
      <div className="flex flex-wrap gap-3">
        {order.canRetryPayment && (
          <Button loading={retrying} onClick={retry}>
            {t('tryAgain')}
          </Button>
        )}
        <Link href={`/orders/${orderId}`} className="inline-flex h-11 items-center rounded-xl border border-sand-300 px-5 font-medium hover:border-brand-500">
          {t('viewOrder')}
        </Link>
      </div>
    </Card>
  );
}

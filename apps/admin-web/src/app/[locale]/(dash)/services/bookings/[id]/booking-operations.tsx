'use client';

import { Alert, Button, Field, SelectField } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { adminCall } from '@/lib/admin-client';

export function BookingOperations({ bookingId, status, technicianId, technicians, canAssign }: { bookingId: string; status: string; technicianId: string | null; technicians: Array<{ id: string; name: string }>; canAssign: boolean }) {
  const t = useTranslations('technician');
  const ta = useTranslations('admin');
  const locale = useLocale();
  const router = useRouter();
  const [tech, setTech] = useState(technicianId ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canAssign || !['CONFIRMED', 'ASSIGNED', 'REQUESTED'].includes(status)) return null;
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-card bg-white p-5 shadow-card">
      {status !== 'REQUESTED' && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-60">
            <SelectField label={t('assignTechnician')} value={tech} onChange={(e) => setTech(e.target.value)}>
              <option value="">{t('unassigned')}</option>
              {technicians.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </SelectField>
          </div>
          <Button loading={busy === 'assign'} disabled={Boolean(busy) || tech === (technicianId ?? '')} onClick={() => run('assign', () => adminCall(`/services/bookings/${bookingId}/assign`, 'POST', { technicianId: tech || null }, locale))}>
            {t('assign')}
          </Button>
          {technicians.length === 0 && <p className="text-xs text-ink-500">{t('noTechniciansInArea')}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <Field label={ta('cancelReason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </div>
        <Button variant="danger" loading={busy === 'cancel'} disabled={Boolean(busy) || reason.trim().length < 2} onClick={() => window.confirm(t('confirmCancelBooking')) && run('cancel', () => adminCall(`/services/bookings/${bookingId}/cancel`, 'POST', { reason: reason.trim() }, locale))}>
          {t('cancelBooking')}
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

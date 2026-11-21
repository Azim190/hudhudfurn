'use client';

import { Alert, Button, Card, Field } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { adminCall } from '@/lib/admin-client';

export interface StorefrontSettings {
  showPrices: boolean;
  whatsapp: string;
  phone: string;
  email: string;
}

export function StorefrontSettingsForm({ initial, canEdit }: { initial: StorefrontSettings; canEdit: boolean }) {
  const t = useTranslations('settings');
  const locale = useLocale();
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  // Catalogue mode without a WhatsApp number leaves customers no way to order.
  const needsWhatsApp = !form.showPrices && !form.whatsapp.trim();

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await adminCall<StorefrontSettings>('/settings/storefront', 'PATCH', form, locale);
      setSaved(next);
      setForm(next);
      setNotice(t('saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="font-semibold">{t('showPrices')}</h2>
            <p className="mt-1 text-sm text-ink-700">{form.showPrices ? t('showPricesOn') : t('showPricesOff')}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.showPrices}
            aria-label={t('showPrices')}
            disabled={!canEdit}
            onClick={() => setForm({ ...form, showPrices: !form.showPrices })}
            data-testid="show-prices-switch"
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${form.showPrices ? 'bg-brand-600' : 'bg-sand-300'}`}
          >
            <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${form.showPrices ? 'start-[1.375rem]' : 'start-0.5'}`} />
          </button>
        </div>
        {needsWhatsApp && <Alert tone="info">{t('needsWhatsApp')}</Alert>}
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <h2 className="font-semibold">{t('contact')}</h2>
        <Field label={t('whatsapp')} hint={t('whatsappHint')} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} disabled={!canEdit} inputMode="tel" placeholder="+966500000000" ltr />
        <Field label={t('phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!canEdit} inputMode="tel" placeholder="+966500000000" ltr />
        <Field label={t('email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!canEdit} ltr />
      </Card>

      {canEdit && (
        <div className="flex gap-3">
          <Button onClick={save} loading={busy} disabled={!dirty}>
            {t('save')}
          </Button>
          {dirty && (
            <Button variant="secondary" onClick={() => setForm(saved)} disabled={busy}>
              {t('discard')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

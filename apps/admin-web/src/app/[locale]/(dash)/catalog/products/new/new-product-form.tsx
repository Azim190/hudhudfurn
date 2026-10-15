'use client';

import { Alert, Button, Card, Field, SelectField } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { adminCall, sarToHalalas } from '@/lib/admin-client';

const MODES = ['FIXED', 'PER_METER', 'PER_SQM', 'CALCULATED'] as const;

export function NewProductForm({ categories }: { categories: Array<{ id: string; label: string }> }) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const router = useRouter();
  const [form, setForm] = useState({ categoryId: categories[0]?.id ?? '', nameAr: '', nameEn: '', pricingMode: 'FIXED' as (typeof MODES)[number], price: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const basePrice = sarToHalalas(form.price);
    if (basePrice === null) {
      setError(t('basePrice'));
      return;
    }
    setBusy(true);
    try {
      const product = await adminCall<{ id: string }>(
        '/products',
        'POST',
        { categoryId: form.categoryId, nameAr: form.nameAr, nameEn: form.nameEn || undefined, pricingMode: form.pricingMode, basePrice },
        locale,
      );
      router.push(`/catalog/products/${product.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 p-6">
      <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SelectField label={t('category')} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </SelectField>
        </div>
        <Field label={`${t('name')} (${t('arabic')})`} dir="rtl" lang="ar" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required minLength={2} />
        <Field label={`${t('name')} (${t('english')})`} dir="ltr" lang="en" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} minLength={2} />
        <SelectField label={t('pricingMode')} value={form.pricingMode} onChange={(e) => setForm({ ...form, pricingMode: e.target.value as (typeof MODES)[number] })}>
          {MODES.map((m) => (
            <option key={m} value={m}>
              {t(`mode_${m}`)}
            </option>
          ))}
        </SelectField>
        <Field label={t('basePrice')} hint={t(`basePriceHint_${form.pricingMode}`)} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} ltr required />
        {error && (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy}>
            {t('create')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

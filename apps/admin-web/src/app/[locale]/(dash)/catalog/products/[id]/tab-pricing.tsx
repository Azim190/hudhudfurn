'use client';

import { Button, Card, Checkbox, Field, SelectField } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { adminCall, halalasToSar, sarToHalalas } from '@/lib/admin-client';
import type { AdminProduct } from '@/lib/catalog-types';
import type { EditorContext } from './product-editor';

const MODES = ['FIXED', 'PER_METER', 'PER_SQM', 'CALCULATED'] as const;
const PHOTO = ['ON_MODEL', 'MANNEQUIN', 'FLAT_LAY', 'LIFESTYLE'] as const;

export function PricingTab({
  ctx,
  categories,
  sizeGuides,
  templates,
}: {
  ctx: EditorContext;
  categories: Array<{ id: string; label: string }>;
  sizeGuides: Array<{ id: string; titleAr: string; titleEn: string | null }>;
  templates: Array<{ id: string; code: string; kind: string; nameAr: string; nameEn: string }>;
}) {
  const t = useTranslations('catalog');
  const ta = useTranslations('admin');
  const locale = useLocale();
  const p = ctx.product;
  const [form, setForm] = useState({
    categoryId: p.categoryId,
    pricingMode: p.pricingMode,
    basePrice: halalasToSar(p.basePrice),
    compareAtPrice: halalasToSar(p.compareAtPrice),
    vatInclusive: p.vatInclusive,
    isMadeToMeasure: p.isMadeToMeasure,
    sampleAvailable: p.sampleAvailable,
    samplePrice: halalasToSar(p.samplePrice),
    photoStyle: p.photoStyle ?? '',
    sizeGuideId: p.sizeGuideId ?? '',
    configuratorTemplateId: p.configuratorTemplateId ?? '',
  });
  const disabled = !ctx.canWrite;

  const save = (e: FormEvent) => {
    e.preventDefault();
    void ctx.mutate(
      () =>
        adminCall<AdminProduct>(
          `/products/${p.id}`,
          'PATCH',
          {
            categoryId: form.categoryId,
            pricingMode: form.pricingMode,
            basePrice: sarToHalalas(form.basePrice) ?? 0,
            compareAtPrice: sarToHalalas(form.compareAtPrice),
            vatInclusive: form.vatInclusive,
            isMadeToMeasure: form.isMadeToMeasure,
            sampleAvailable: form.sampleAvailable,
            samplePrice: form.sampleAvailable ? sarToHalalas(form.samplePrice) : null,
            photoStyle: form.photoStyle || null,
            sizeGuideId: form.sizeGuideId || null,
            configuratorTemplateId: form.configuratorTemplateId || null,
          },
          locale,
        ),
      t('saved'),
    );
  };

  return (
    <form onSubmit={save}>
      <Card className="grid gap-5 p-5 sm:grid-cols-2">
        <SelectField label={t('category')} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} disabled={disabled}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('pricingMode')} value={form.pricingMode} onChange={(e) => setForm({ ...form, pricingMode: e.target.value as AdminProduct['pricingMode'] })} disabled={disabled}>
          {MODES.map((m) => (
            <option key={m} value={m}>
              {t(`mode_${m}`)}
            </option>
          ))}
        </SelectField>
        <Field label={t('basePrice')} hint={t(`basePriceHint_${form.pricingMode}`)} inputMode="decimal" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} ltr disabled={disabled} />
        <Field label={t('compareAtPrice')} inputMode="decimal" value={form.compareAtPrice} onChange={(e) => setForm({ ...form, compareAtPrice: e.target.value })} ltr disabled={disabled} />
        <SelectField label={t('photoStyle')} value={form.photoStyle} onChange={(e) => setForm({ ...form, photoStyle: e.target.value })} disabled={disabled}>
          <option value="">{t('none')}</option>
          {PHOTO.map((s) => (
            <option key={s} value={s}>
              {t(`photo_${s}`)}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('sizeGuide')} value={form.sizeGuideId} onChange={(e) => setForm({ ...form, sizeGuideId: e.target.value })} disabled={disabled}>
          <option value="">{t('none')}</option>
          {sizeGuides.map((g) => (
            <option key={g.id} value={g.id}>
              {locale === 'en' ? g.titleEn || g.titleAr : g.titleAr}
            </option>
          ))}
        </SelectField>
        <SelectField label={ta('configuratorTemplate')} value={form.configuratorTemplateId} onChange={(e) => setForm({ ...form, configuratorTemplateId: e.target.value })} disabled={disabled}>
          <option value="">{ta('none')}</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {locale === 'en' ? tpl.nameEn : tpl.nameAr} ({tpl.kind})
            </option>
          ))}
        </SelectField>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <Checkbox label={t('vatInclusive')} checked={form.vatInclusive} onChange={(e) => setForm({ ...form, vatInclusive: e.target.checked })} disabled={disabled} />
          <Checkbox label={t('madeToMeasure')} checked={form.isMadeToMeasure} onChange={(e) => setForm({ ...form, isMadeToMeasure: e.target.checked })} disabled={disabled} />
          <Checkbox label={t('sampleAvailable')} checked={form.sampleAvailable} onChange={(e) => setForm({ ...form, sampleAvailable: e.target.checked })} disabled={disabled} />
          {form.sampleAvailable && (
            <div className="max-w-xs">
              <Field label={t('samplePrice')} inputMode="decimal" value={form.samplePrice} onChange={(e) => setForm({ ...form, samplePrice: e.target.value })} ltr disabled={disabled} />
            </div>
          )}
        </div>
      </Card>
      {ctx.canWrite && (
        <Button type="submit" loading={ctx.busy} className="mt-4">
          {t('save')}
        </Button>
      )}
    </form>
  );
}

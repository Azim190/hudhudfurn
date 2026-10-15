'use client';

import { Button, Card, Field, TextAreaField } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { adminCall } from '@/lib/admin-client';
import type { AdminProduct } from '@/lib/catalog-types';
import type { EditorContext } from './product-editor';

type Lang = 'Ar' | 'En';
const FIELDS = ['name', 'description', 'care', 'seoTitle', 'seoDescription', 'slug'] as const;
type Key = `${(typeof FIELDS)[number]}${Lang}`;

/** Side-by-side bilingual editor: Arabic (RTL) and English (LTR) columns. */
export function DetailsTab({ ctx }: { ctx: EditorContext }) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const p = ctx.product;
  const [form, setForm] = useState<Record<Key, string>>(() => {
    const out = {} as Record<Key, string>;
    for (const f of FIELDS) for (const l of ['Ar', 'En'] as const) out[`${f}${l}`] = (p[`${f}${l}` as keyof AdminProduct] as string | null) ?? '';
    return out;
  });
  const set = (k: Key) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(form)) {
      const original = (p[k as keyof AdminProduct] as string | null) ?? '';
      if (v !== original) body[k] = v.trim() === '' && (k === 'slugAr' || k === 'slugEn' || k === 'nameAr') ? undefined : v;
    }
    void ctx.mutate(() => adminCall<AdminProduct>(`/products/${p.id}`, 'PATCH', body, locale), t('saved'));
  };

  const column = (lang: Lang) => {
    const dir = lang === 'Ar' ? 'rtl' : 'ltr';
    const htmlLang = lang === 'Ar' ? 'ar' : 'en';
    return (
      <Card className="flex flex-col gap-4 p-5" dir={dir} lang={htmlLang}>
        <h2 className="text-sm font-semibold text-ink-500">{lang === 'Ar' ? t('arabic') : t('english')}</h2>
        <Field label={t('name')} value={form[`name${lang}`]} onChange={set(`name${lang}`)} required={lang === 'Ar'} maxLength={160} disabled={!ctx.canWrite} />
        <TextAreaField label={t('description')} value={form[`description${lang}`]} onChange={set(`description${lang}`)} rows={6} maxLength={10_000} disabled={!ctx.canWrite} />
        <TextAreaField label={t('care')} value={form[`care${lang}`]} onChange={set(`care${lang}`)} rows={3} maxLength={3000} disabled={!ctx.canWrite} />
        <Field label={t('seoTitle')} value={form[`seoTitle${lang}`]} onChange={set(`seoTitle${lang}`)} maxLength={70} hint={`${form[`seoTitle${lang}`].length}/70`} disabled={!ctx.canWrite} />
        <TextAreaField label={t('seoDescription')} value={form[`seoDescription${lang}`]} onChange={set(`seoDescription${lang}`)} rows={2} maxLength={170} hint={`${form[`seoDescription${lang}`].length}/170`} disabled={!ctx.canWrite} />
        <Field label={t('slug')} value={form[`slug${lang}`]} onChange={set(`slug${lang}`)} dir={lang === 'Ar' ? 'rtl' : 'ltr'} disabled={!ctx.canWrite} />
      </Card>
    );
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {column('Ar')}
        {column('En')}
      </div>
      {ctx.canWrite && (
        <div>
          <Button type="submit" loading={ctx.busy}>
            {t('save')}
          </Button>
        </div>
      )}
    </form>
  );
}

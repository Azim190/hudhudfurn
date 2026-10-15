'use client';

import { Alert, Badge, Button, Card, Checkbox, Field, SelectField, TextAreaField, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { adminCall } from '@/lib/admin-client';
import { flattenCategories, type Attribute, type CategoryNode } from '@/lib/catalog-types';

const VERTICALS = ['CURTAINS', 'BEDDING', 'SOFA_COVERS', 'ABAYAS', 'ACCESSORIES'] as const;

interface CategoryDetail extends Omit<CategoryNode, 'children' | 'productCount'> {
  attributes: Array<{ attributeId: string; isFacet: boolean; isVariantAxis: boolean; isRequired: boolean; sortOrder: number }>;
}

type Form = {
  parentId: string;
  vertical: (typeof VERTICALS)[number];
  nameAr: string;
  nameEn: string;
  slugAr: string;
  slugEn: string;
  descriptionAr: string;
  descriptionEn: string;
  sortOrder: string;
  isActive: boolean;
};

const empty: Form = { parentId: '', vertical: 'CURTAINS', nameAr: '', nameEn: '', slugAr: '', slugEn: '', descriptionAr: '', descriptionEn: '', sortOrder: '0', isActive: true };

export function CategoryManager({ initialTree, attributes, canWrite }: { initialTree: CategoryNode[]; attributes: Attribute[]; canWrite: boolean }) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const router = useRouter();
  const flat = flattenCategories(initialTree);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [config, setConfig] = useState<Record<string, { on: boolean; isFacet: boolean; isVariantAxis: boolean; isRequired: boolean }>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const name = (c: { nameAr: string; nameEn: string | null }) => (locale === 'en' ? c.nameEn || c.nameAr : c.nameAr);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'success', text: t('saved') });
      router.refresh();
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const select = async (id: string | null) => {
    setSelectedId(id);
    setMessage(null);
    if (!id) {
      setForm(empty);
      setConfig({});
      return;
    }
    const c = await adminCall<CategoryDetail>(`/categories/${id}`, 'GET', undefined, locale);
    setForm({
      parentId: c.parentId ?? '',
      vertical: c.vertical,
      nameAr: c.nameAr,
      nameEn: c.nameEn ?? '',
      slugAr: c.slugAr,
      slugEn: c.slugEn,
      descriptionAr: c.descriptionAr ?? '',
      descriptionEn: c.descriptionEn ?? '',
      sortOrder: String(c.sortOrder),
      isActive: c.isActive,
    });
    setConfig(Object.fromEntries(c.attributes.map((a) => [a.attributeId, { on: true, isFacet: a.isFacet, isVariantAxis: a.isVariantAxis, isRequired: a.isRequired }])));
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const body = {
      parentId: form.parentId || null,
      vertical: form.vertical,
      nameAr: form.nameAr,
      nameEn: form.nameEn || undefined,
      slugAr: form.slugAr || undefined,
      slugEn: form.slugEn || undefined,
      descriptionAr: form.descriptionAr || undefined,
      descriptionEn: form.descriptionEn || undefined,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    };
    void run(async () => {
      const saved = selectedId
        ? await adminCall<{ id: string }>(`/categories/${selectedId}`, 'PATCH', body, locale)
        : await adminCall<{ id: string }>('/categories', 'POST', body, locale);
      const items = Object.entries(config)
        .filter(([, v]) => v.on)
        .map(([attributeId, v], sortOrder) => ({ attributeId, isFacet: v.isFacet, isVariantAxis: v.isVariantAxis, isRequired: v.isRequired, sortOrder }));
      await adminCall(`/categories/${saved.id}/attributes`, 'PUT', { items }, locale);
      setSelectedId(saved.id);
    });
  };

  const remove = () => selectedId && run(async () => {
    await adminCall(`/categories/${selectedId}`, 'DELETE', undefined, locale);
    setSelectedId(null);
    setForm(empty);
  });

  const setAttr = (id: string, patch: Partial<{ on: boolean; isFacet: boolean; isVariantAxis: boolean; isRequired: boolean }>) =>
    setConfig((c) => ({ ...c, [id]: { on: false, isFacet: true, isVariantAxis: false, isRequired: false, ...c[id], ...patch } }));

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('categories')}</h1>
        {canWrite && (
          <Button size="sm" onClick={() => select(null)}>
            {t('newCategory')}
          </Button>
        )}
      </div>
      {message && <Alert tone={message.tone} className="mt-4">{message.text}</Alert>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(260px,1fr)_2fr]">
        <Card className="p-2">
          <ul>
            {flat.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => select(c.id)}
                  aria-current={selectedId === c.id ? 'true' : undefined}
                  style={{ paddingInlineStart: `${12 + c.depth * 20}px` }}
                  className={cn('flex w-full items-center justify-between gap-2 rounded-lg py-2 pe-3 text-start text-sm', selectedId === c.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-sand-100')}
                >
                  <span className={cn(!c.isActive && 'text-ink-500 line-through')}>{name(c)}</span>
                  <span className="text-xs text-ink-500">{t('productsCount', { count: c.productCount })}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <form onSubmit={save} className="flex flex-col gap-5">
            <h2 className="font-semibold">{selectedId ? t('editCategory') : t('newCategory')}</h2>
            <fieldset disabled={!canWrite} className="grid gap-4 sm:grid-cols-2">
              <SelectField label={t('parentCategory')} value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                <option value="">{t('rootCategory')}</option>
                {flat
                  .filter((c) => c.id !== selectedId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {'— '.repeat(c.depth)}
                      {name(c)}
                    </option>
                  ))}
              </SelectField>
              <SelectField label={t('vertical')} value={form.vertical} onChange={(e) => setForm({ ...form, vertical: e.target.value as Form['vertical'] })}>
                {VERTICALS.map((v) => (
                  <option key={v} value={v}>
                    {t(`vertical_${v}`)}
                  </option>
                ))}
              </SelectField>
              <Field label={`${t('name')} (${t('arabic')})`} dir="rtl" lang="ar" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
              <Field label={`${t('name')} (${t('english')})`} dir="ltr" lang="en" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
              <Field label={`${t('slug')} (${t('arabic')})`} dir="rtl" value={form.slugAr} onChange={(e) => setForm({ ...form, slugAr: e.target.value })} />
              <Field label={`${t('slug')} (${t('english')})`} dir="ltr" value={form.slugEn} onChange={(e) => setForm({ ...form, slugEn: e.target.value })} />
              <TextAreaField label={`${t('description')} (${t('arabic')})`} dir="rtl" lang="ar" value={form.descriptionAr} onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })} rows={3} />
              <TextAreaField label={`${t('description')} (${t('english')})`} dir="ltr" lang="en" value={form.descriptionEn} onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })} rows={3} />
              <Field label={t('sortOrder')} inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} ltr />
              <div className="flex items-end pb-3">
                <Checkbox label={t('isActive')} checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              </div>
            </fieldset>

            {attributes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">{t('categoryAttributes')}</h3>
                <p className="mt-1 text-xs text-ink-500">{t('categoryAttributesHint')}</p>
                <div className="mt-3 overflow-x-auto rounded-xl border border-sand-200">
                  <table className="w-full text-sm">
                    <thead className="bg-sand-50 text-xs text-ink-500">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-start font-medium">{t('attributes')}</th>
                        <th scope="col" className="px-3 py-2 text-start font-medium">{t('facet')}</th>
                        <th scope="col" className="px-3 py-2 text-start font-medium">{t('variantAxis')}</th>
                        <th scope="col" className="px-3 py-2 text-start font-medium">{t('required')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attributes.map((a) => {
                        const c = config[a.id];
                        return (
                          <tr key={a.id} className="border-t border-sand-100">
                            <td className="px-3 py-2">
                              <Checkbox label={name(a)} checked={c?.on ?? false} disabled={!canWrite} onChange={(e) => setAttr(a.id, { on: e.target.checked })} />
                            </td>
                            {(['isFacet', 'isVariantAxis', 'isRequired'] as const).map((flag) => (
                              <td key={flag} className="px-3 py-2">
                                <input type="checkbox" className="size-4 accent-brand-600" aria-label={`${name(a)} ${t(flag === 'isFacet' ? 'facet' : flag === 'isVariantAxis' ? 'variantAxis' : 'required')}`} disabled={!canWrite || !c?.on} checked={c?.[flag] ?? false} onChange={(e) => setAttr(a.id, { [flag]: e.target.checked })} />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {canWrite && (
              <div className="flex gap-2">
                <Button type="submit" loading={busy}>
                  {t('save')}
                </Button>
                {selectedId && (
                  <Button type="button" variant="ghost" disabled={busy} onClick={remove}>
                    {t('delete')}
                  </Button>
                )}
                {selectedId && !form.isActive && <Badge className="self-center">{t('hidden')}</Badge>}
              </div>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}

'use client';

import { Alert, Badge, Button, Card, Field, SelectField } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { adminCall } from '@/lib/admin-client';
import type { Attribute, AttributeValue } from '@/lib/catalog-types';

const TYPES = ['SELECT', 'MULTISELECT', 'BOOLEAN', 'NUMBER', 'COLOR'] as const;

export function AttributeManager({ initial, canWrite }: { initial: Attribute[]; canWrite: boolean }) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const router = useRouter();
  const [attributes, setAttributes] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [form, setForm] = useState({ key: '', nameAr: '', nameEn: '', type: 'SELECT' as (typeof TYPES)[number], unit: '' });
  const name = (a: { nameAr: string; nameEn: string | null }) => (locale === 'en' ? a.nameEn || a.nameAr : a.nameAr);

  const run = async (fn: () => Promise<void>) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'success', text: t('saved') });
      router.refresh();
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const a = await adminCall<Attribute>('/attributes', 'POST', { key: form.key, nameAr: form.nameAr, nameEn: form.nameEn || undefined, type: form.type, unit: form.unit || undefined }, locale);
      setAttributes((list) => [...list, { ...a, values: [] }]);
      setForm({ key: '', nameAr: '', nameEn: '', type: 'SELECT', unit: '' });
      setOpenId(a.id);
    });
  };

  const upsertValue = (attributeId: string, value: AttributeValue) =>
    setAttributes((list) => list.map((a) => (a.id === attributeId ? { ...a, values: [...a.values.filter((v) => v.id !== value.id), value] } : a)));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">{t('attributes')}</h1>
      {message && <Alert tone={message.tone} className="mt-4">{message.text}</Alert>}

      <ul className="mt-6 flex flex-col gap-3">
        {attributes.map((a) => (
          <li key={a.id}>
            <Card>
              <button type="button" aria-expanded={openId === a.id} onClick={() => setOpenId(openId === a.id ? null : a.id)} className="flex w-full items-center justify-between gap-3 p-4 text-start">
                <span>
                  <span className="font-medium">{name(a)}</span>
                  <span className="ms-2 font-mono text-xs text-ink-500" dir="ltr">
                    {a.key}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-ink-500">
                  <Badge>{t(`type_${a.type}`)}</Badge>
                  <span>
                    {a.values.length} {t('values')}
                  </span>
                  {a._count && <span>{t('usedIn', { count: a._count.categories })}</span>}
                </span>
              </button>
              {openId === a.id && <ValuesEditor attribute={a} canWrite={canWrite} onSaved={(v) => upsertValue(a.id, v)} run={run} />}
            </Card>
          </li>
        ))}
      </ul>

      {canWrite && (
        <Card className="mt-6 p-5">
          <h2 className="font-semibold">{t('newAttribute')}</h2>
          <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('attributeKey')} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} pattern="[a-z][a-z0-9_]{1,40}" placeholder="heading_style" ltr required />
            <SelectField label={t('attributeType')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as (typeof TYPES)[number] })}>
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`type_${x}`)}
                </option>
              ))}
            </SelectField>
            <Field label={`${t('name')} (${t('arabic')})`} dir="rtl" lang="ar" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
            <Field label={`${t('name')} (${t('english')})`} dir="ltr" lang="en" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
            <Field label={t('unit')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="cm" ltr />
            <div className="flex items-end">
              <Button type="submit">{t('create')}</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

function ValuesEditor({
  attribute,
  canWrite,
  onSaved,
  run,
}: {
  attribute: Attribute;
  canWrite: boolean;
  onSaved: (v: AttributeValue) => void;
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const [draft, setDraft] = useState({ code: '', labelAr: '', labelEn: '', swatchHex: '#000000' });
  const isColor = attribute.type === 'COLOR';
  const values = [...attribute.values].sort((a, b) => a.sortOrder - b.sortOrder);

  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const v = await adminCall<AttributeValue>(
        `/attributes/${attribute.id}/values`,
        'POST',
        { code: draft.code, labelAr: draft.labelAr, labelEn: draft.labelEn || undefined, swatchHex: isColor ? draft.swatchHex : undefined, sortOrder: values.length },
        locale,
      );
      onSaved(v);
      setDraft({ code: '', labelAr: '', labelEn: '', swatchHex: '#000000' });
    });
  };

  const update = (v: AttributeValue, patch: Partial<AttributeValue>) =>
    run(async () => onSaved(await adminCall<AttributeValue>(`/attribute-values/${v.id}`, 'PATCH', patch, locale)));

  return (
    <div className="border-t border-sand-200 p-4">
      <table className="w-full text-sm">
        <thead className="text-xs text-ink-500">
          <tr>
            <th scope="col" className="py-2 text-start font-medium">{t('valueCode')}</th>
            <th scope="col" className="py-2 text-start font-medium">{t('labelAr')}</th>
            <th scope="col" className="py-2 text-start font-medium">{t('labelEn')}</th>
            {isColor && <th scope="col" className="py-2 text-start font-medium">{t('swatch')}</th>}
          </tr>
        </thead>
        <tbody>
          {values.map((v) => (
            <tr key={v.id} className="border-t border-sand-100">
              <td className="py-2 font-mono text-xs" dir="ltr">
                <span className="block text-start">{v.code}</span>
              </td>
              <td className="py-2 pe-2">
                <input defaultValue={v.labelAr} dir="rtl" lang="ar" aria-label={`${t('labelAr')} ${v.code}`} disabled={!canWrite} onBlur={(e) => e.target.value !== v.labelAr && update(v, { labelAr: e.target.value })} className="h-9 w-full rounded-lg border border-sand-300 px-2" />
              </td>
              <td className="py-2 pe-2">
                <input defaultValue={v.labelEn ?? ''} dir="ltr" lang="en" aria-label={`${t('labelEn')} ${v.code}`} disabled={!canWrite} onBlur={(e) => e.target.value !== (v.labelEn ?? '') && update(v, { labelEn: e.target.value })} className="h-9 w-full rounded-lg border border-sand-300 px-2" />
              </td>
              {isColor && (
                <td className="py-2">
                  <input type="color" defaultValue={v.swatchHex ?? '#000000'} aria-label={`${t('swatch')} ${v.code}`} disabled={!canWrite} onBlur={(e) => e.target.value !== v.swatchHex && update(v, { swatchHex: e.target.value })} className="h-9 w-12 rounded-lg border border-sand-300" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && (
        <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2">
          <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder={t('valueCode')} aria-label={t('valueCode')} pattern="[a-z0-9][a-z0-9_.\-]{0,63}" dir="ltr" required className="h-10 w-36 rounded-lg border border-sand-300 px-2 font-mono text-sm" />
          <input value={draft.labelAr} onChange={(e) => setDraft({ ...draft, labelAr: e.target.value })} placeholder={t('labelAr')} aria-label={t('labelAr')} dir="rtl" lang="ar" required className="h-10 w-44 rounded-lg border border-sand-300 px-2" />
          <input value={draft.labelEn} onChange={(e) => setDraft({ ...draft, labelEn: e.target.value })} placeholder={t('labelEn')} aria-label={t('labelEn')} dir="ltr" lang="en" className="h-10 w-44 rounded-lg border border-sand-300 px-2" />
          {isColor && <input type="color" value={draft.swatchHex} onChange={(e) => setDraft({ ...draft, swatchHex: e.target.value })} aria-label={t('swatch')} className="h-10 w-12 rounded-lg border border-sand-300" />}
          <Button type="submit" size="sm">
            {t('addValue')}
          </Button>
        </form>
      )}
    </div>
  );
}

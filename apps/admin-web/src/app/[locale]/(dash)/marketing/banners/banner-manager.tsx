'use client';

import { Alert, Badge, Button, Card, Checkbox, Field, SelectField } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { adminCall, adminUpload } from '@/lib/admin-client';
import type { MediaDto } from '@/lib/catalog-types';

export interface AdminBanner {
  id: string;
  placement: 'HERO' | 'STRIP' | 'CATEGORY';
  titleAr: string;
  titleEn: string | null;
  subtitleAr: string | null;
  subtitleEn: string | null;
  ctaAr: string | null;
  ctaEn: string | null;
  link: string | null;
  imageAr: MediaDto | null;
  imageEn: MediaDto | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  sortOrder: number;
}

type Form = {
  placement: AdminBanner['placement'];
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  ctaAr: string;
  ctaEn: string;
  link: string;
  imageAr: MediaDto | null;
  imageEn: MediaDto | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  sortOrder: string;
};

const EMPTY: Form = { placement: 'HERO', titleAr: '', titleEn: '', subtitleAr: '', subtitleEn: '', ctaAr: '', ctaEn: '', link: '', imageAr: null, imageEn: null, startsAt: '', endsAt: '', isActive: true, sortOrder: '0' };

/** <input type="datetime-local"> works in local time; the API stores UTC. */
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function statusOf(b: AdminBanner): 'live' | 'scheduled' | 'ended' | 'inactive' {
  const now = Date.now();
  if (!b.isActive) return 'inactive';
  if (b.startsAt && new Date(b.startsAt).getTime() > now) return 'scheduled';
  if (b.endsAt && new Date(b.endsAt).getTime() <= now) return 'ended';
  return 'live';
}

export function BannerManager({ initial, canWrite }: { initial: AdminBanner[]; canWrite: boolean }) {
  const t = useTranslations('marketing');
  const tc = useTranslations('catalog');
  const locale = useLocale();
  const [banners, setBanners] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const edit = (b: AdminBanner | null) => {
    setMessage(null);
    setEditing(b?.id ?? 'new');
    setForm(
      b
        ? {
            placement: b.placement,
            titleAr: b.titleAr,
            titleEn: b.titleEn ?? '',
            subtitleAr: b.subtitleAr ?? '',
            subtitleEn: b.subtitleEn ?? '',
            ctaAr: b.ctaAr ?? '',
            ctaEn: b.ctaEn ?? '',
            link: b.link ?? '',
            imageAr: b.imageAr,
            imageEn: b.imageEn,
            startsAt: toLocalInput(b.startsAt),
            endsAt: toLocalInput(b.endsAt),
            isActive: b.isActive,
            sortOrder: String(b.sortOrder),
          }
        : EMPTY,
    );
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const body = {
      placement: form.placement,
      titleAr: form.titleAr,
      titleEn: form.titleEn || undefined,
      subtitleAr: form.subtitleAr || undefined,
      subtitleEn: form.subtitleEn || undefined,
      ctaAr: form.ctaAr || undefined,
      ctaEn: form.ctaEn || undefined,
      link: form.link || null,
      imageArId: form.imageAr?.id ?? null,
      imageEnId: form.imageEn?.id ?? null,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder) || 0,
    };
    try {
      const saved =
        editing === 'new'
          ? await adminCall<AdminBanner>('/banners', 'POST', body, locale)
          : await adminCall<AdminBanner>(`/banners/${editing}`, 'PATCH', body, locale);
      setBanners((list) => [...list.filter((b) => b.id !== saved.id), saved].sort((a, b) => a.placement.localeCompare(b.placement) || a.sortOrder - b.sortOrder));
      setEditing(saved.id);
      setMessage({ tone: 'success', text: tc('saved') });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || editing === 'new' || !window.confirm(t('confirmDelete'))) return;
    setBusy(true);
    try {
      await adminCall(`/banners/${editing}`, 'DELETE', undefined, locale);
      setBanners((list) => list.filter((b) => b.id !== editing));
      setEditing(null);
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const tone = { live: 'bg-success-50 text-success-600', scheduled: 'bg-brand-50 text-brand-700', ended: 'bg-sand-200 text-ink-700', inactive: 'bg-sand-200 text-ink-500' } as const;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('banners')}</h1>
        {canWrite && (
          <Button size="sm" onClick={() => edit(null)}>
            {t('newBanner')}
          </Button>
        )}
      </div>
      {message && <Alert tone={message.tone} className="mt-4">{message.text}</Alert>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(280px,1fr)_2fr]">
        <Card className="p-2">
          {banners.length === 0 ? (
            <p className="p-6 text-sm text-ink-500">{t('noBanners')}</p>
          ) : (
            <ul>
              {banners.map((b) => {
                const s = statusOf(b);
                const img = b.imageAr ?? b.imageEn;
                return (
                  <li key={b.id}>
                    <button type="button" onClick={() => edit(b)} aria-current={editing === b.id ? 'true' : undefined} className="flex w-full items-center gap-3 rounded-lg p-2 text-start hover:bg-sand-100 aria-[current=true]:bg-brand-50">
                      {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail rendition */}
                      {img ? <img src={img.thumbnailUrl} alt="" width={64} height={28} className="h-10 w-20 rounded object-cover" /> : <span className="h-10 w-20 rounded bg-sand-200" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{locale === 'en' ? b.titleEn || b.titleAr : b.titleAr}</span>
                        <span className="text-xs text-ink-500">{t(`placement_${b.placement}`)}</span>
                      </span>
                      <Badge className={tone[s]}>{t(`status_${s}`)}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {editing && (
          <Card className="p-5">
            <form onSubmit={save} className="flex flex-col gap-4">
              <h2 className="font-semibold">{editing === 'new' ? t('newBanner') : t('editBanner')}</h2>
              <fieldset disabled={!canWrite} className="grid gap-4 sm:grid-cols-2">
                <SelectField label={t('placement')} value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value as Form['placement'] })}>
                  {(['HERO', 'STRIP', 'CATEGORY'] as const).map((p) => (
                    <option key={p} value={p}>
                      {t(`placement_${p}`)}
                    </option>
                  ))}
                </SelectField>
                <Field label={t('link')} hint={t('linkHint')} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} ltr placeholder="/collections/ramadan" />
                <Field label={`${t('title')} (${tc('arabic')})`} dir="rtl" lang="ar" value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} required minLength={2} />
                <Field label={`${t('title')} (${tc('english')})`} dir="ltr" lang="en" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
                <Field label={`${t('subtitle')} (${tc('arabic')})`} dir="rtl" lang="ar" value={form.subtitleAr} onChange={(e) => setForm({ ...form, subtitleAr: e.target.value })} />
                <Field label={`${t('subtitle')} (${tc('english')})`} dir="ltr" lang="en" value={form.subtitleEn} onChange={(e) => setForm({ ...form, subtitleEn: e.target.value })} />
                <Field label={`${t('cta')} (${tc('arabic')})`} dir="rtl" lang="ar" value={form.ctaAr} onChange={(e) => setForm({ ...form, ctaAr: e.target.value })} />
                <Field label={`${t('cta')} (${tc('english')})`} dir="ltr" lang="en" value={form.ctaEn} onChange={(e) => setForm({ ...form, ctaEn: e.target.value })} />
                <ImagePicker label={t('imageAr')} value={form.imageAr} onChange={(imageAr) => setForm({ ...form, imageAr })} alt={form.titleAr} />
                <ImagePicker label={t('imageEn')} value={form.imageEn} onChange={(imageEn) => setForm({ ...form, imageEn })} alt={form.titleEn || form.titleAr} />
                <p className="text-xs text-ink-500 sm:col-span-2">{t('imageHint')}</p>
                <Field label={t('startsAt')} type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} ltr />
                <Field label={t('endsAt')} type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} ltr />
                <Field label={tc('sortOrder')} inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} ltr />
                <div className="flex items-end pb-3">
                  <Checkbox label={t('active')} checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                </div>
              </fieldset>
              {canWrite && (
                <div className="flex gap-2">
                  <Button type="submit" loading={busy}>
                    {tc('save')}
                  </Button>
                  {editing !== 'new' && (
                    <Button type="button" variant="ghost" disabled={busy} onClick={remove}>
                      {tc('delete')}
                    </Button>
                  )}
                </div>
              )}
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}

function ImagePicker({ label, value, onChange, alt }: { label: string; value: MediaDto | null; onChange: (m: MediaDto | null) => void; alt: string }) {
  const t = useTranslations('marketing');
  const locale = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (alt) form.append('altAr', alt);
      onChange(await adminUpload<MediaDto>('media', form, locale));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink-700">{label}</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- rendition preview */}
      {value ? <img src={value.thumbnailUrl} alt="" className="aspect-[16/7] w-full rounded-lg object-cover" /> : <div className="aspect-[16/7] w-full rounded-lg bg-sand-100" />}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" aria-label={label} onChange={(e) => upload(e.target.files?.[0])} />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
          {t('upload')}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
            {t('removeImage')}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-danger-600">{error}</p>}
    </div>
  );
}

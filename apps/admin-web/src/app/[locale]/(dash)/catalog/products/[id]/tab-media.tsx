'use client';

import { Badge, Button, Card } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { adminCall, adminUpload } from '@/lib/admin-client';
import type { AdminProduct, MediaDto } from '@/lib/catalog-types';
import type { EditorContext } from './product-editor';

type Item = AdminProduct['media'][number];

export function MediaTab({ ctx, canUpload }: { ctx: EditorContext; canUpload: boolean }) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const p = ctx.product;
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const save = (items: Array<{ mediaId: string; variantId: string | null }>) =>
    ctx.mutate(() => adminCall<AdminProduct>(`/products/${p.id}/media`, 'PUT', { items }, locale));
  const current = () => p.media.map((m) => ({ mediaId: m.id, variantId: m.variantId }));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    await ctx.mutate(async () => {
      const added: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        // Default Arabic alt text so the product stays publishable; editors refine it below.
        form.append('altAr', p.nameAr);
        if (p.nameEn) form.append('altEn', p.nameEn);
        added.push((await adminUpload<MediaDto>('media', form, locale)).id);
      }
      return adminCall<AdminProduct>(`/products/${p.id}/media`, 'PUT', { items: [...current(), ...added.map((mediaId) => ({ mediaId, variantId: null }))] }, locale);
    }, t('saved'));
    setUploading(false);
    if (input.current) input.current.value = '';
  };

  const move = (index: number, delta: number) => {
    const items = current();
    const [item] = items.splice(index, 1);
    items.splice(index + delta, 0, item!);
    void save(items);
  };

  const variantLabel = (id: string) => {
    const v = p.variants.find((x) => x.id === id);
    return v ? v.options.map((o) => (locale === 'en' ? o.labelEn || o.labelAr : o.labelAr)).join(' · ') || v.sku : id;
  };
  const colorVariants = p.variants.filter((v) => v.isActive);

  return (
    <div className="flex flex-col gap-4">
      {canUpload && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-ink-500">{t('uploadHint')}</p>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" id="media-upload" onChange={(e) => upload(e.target.files)} />
          <Button loading={uploading} onClick={() => input.current?.click()}>
            {t('uploadImages')}
          </Button>
        </Card>
      )}
      {p.media.length === 0 ? (
        <p className="text-sm text-ink-500">{t('noImages')}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {p.media.map((m, i) => (
            <MediaCard
              key={m.id}
              item={m}
              index={i}
              total={p.media.length}
              ctx={ctx}
              canEdit={canUpload}
              onMove={move}
              onRemove={() => save(current().filter((x) => x.mediaId !== m.id))}
              onVariant={(variantId) => save(current().map((x) => (x.mediaId === m.id ? { ...x, variantId } : x)))}
              variants={colorVariants.map((v) => ({ id: v.id, label: variantLabel(v.id) }))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MediaCard({
  item,
  index,
  total,
  ctx,
  canEdit,
  onMove,
  onRemove,
  onVariant,
  variants,
}: {
  item: Item;
  index: number;
  total: number;
  ctx: EditorContext;
  canEdit: boolean;
  onMove: (index: number, delta: number) => void;
  onRemove: () => void;
  onVariant: (variantId: string | null) => void;
  variants: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const [altAr, setAltAr] = useState(item.altAr ?? '');
  const [altEn, setAltEn] = useState(item.altEn ?? '');

  const saveAlt = () => {
    if (altAr === (item.altAr ?? '') && altEn === (item.altEn ?? '')) return;
    void ctx.mutate(async () => {
      await adminCall(`/media/${item.id}`, 'PATCH', { altAr, altEn }, locale);
      return adminCall<AdminProduct>(`/products/${ctx.product.id}`, 'GET', undefined, locale);
    });
  };

  return (
    <li>
      <Card className="flex h-full flex-col overflow-hidden">
        <div className="relative aspect-[4/5] bg-sand-100">
          {/* eslint-disable-next-line @next/next/no-img-element -- CDN rendition */}
          <img src={item.thumbnailUrl} alt={locale === 'en' ? item.altEn || item.altAr || '' : item.altAr || ''} className="size-full object-cover" />
          <div className="absolute start-2 top-2 flex gap-1">
            {index === 0 && <Badge className="bg-brand-600 text-white">1</Badge>}
            {item.status === 'PROCESSING' && <Badge>{t('processing')}</Badge>}
            {item.status === 'FAILED' && <Badge className="bg-danger-50 text-danger-600">{t('mediaFailed')}</Badge>}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3 text-sm">
          <input value={altAr} onChange={(e) => setAltAr(e.target.value)} onBlur={saveAlt} dir="rtl" lang="ar" placeholder={t('altAr')} aria-label={t('altAr')} disabled={!canEdit} className="h-9 rounded-lg border border-sand-300 px-2" />
          <input value={altEn} onChange={(e) => setAltEn(e.target.value)} onBlur={saveAlt} dir="ltr" lang="en" placeholder={t('altEn')} aria-label={t('altEn')} disabled={!canEdit} className="h-9 rounded-lg border border-sand-300 px-2" />
          <label className="flex items-center gap-2 text-xs text-ink-500">
            {t('linkVariant')}
            <select value={item.variantId ?? ''} onChange={(e) => onVariant(e.target.value || null)} disabled={!canEdit || ctx.busy} className="h-8 flex-1 rounded-lg border border-sand-300 bg-white px-2 text-sm text-ink-900">
              <option value="">{t('allVariants')}</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          {canEdit && (
            <div className="mt-auto flex justify-between gap-1 pt-1">
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" disabled={index === 0 || ctx.busy} onClick={() => onMove(index, -1)} aria-label={t('moveUp')}>
                  ↑
                </Button>
                <Button size="sm" variant="secondary" disabled={index === total - 1 || ctx.busy} onClick={() => onMove(index, 1)} aria-label={t('moveDown')}>
                  ↓
                </Button>
              </div>
              <Button size="sm" variant="ghost" disabled={ctx.busy} onClick={onRemove}>
                {t('remove')}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </li>
  );
}

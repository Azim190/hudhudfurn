'use client';

import { Alert, Badge, Button, Card, Field, SelectField } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { adminCall, adminUpload, sarToHalalas } from '@/lib/admin-client';
import type { MediaDto } from '@/lib/catalog-types';

const MODES = ['FIXED', 'PER_METER', 'PER_SQM', 'CALCULATED'] as const;

interface PickedImage {
  file: File;
  preview: string;
}

export function NewProductForm({ categories, canUpload }: { categories: Array<{ id: string; label: string }>; canUpload: boolean }) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ categoryId: categories[0]?.id ?? '', nameAr: '', nameEn: '', pricingMode: 'FIXED' as (typeof MODES)[number], price: '' });
  const [images, setImages] = useState<PickedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Set when the product exists but its images failed: never create it a second time.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Release preview object URLs on unmount (removed images are released as they go).
  const latest = useRef(images);
  latest.current = images;
  useEffect(() => () => latest.current.forEach((img) => URL.revokeObjectURL(img.preview)), []);

  const removeImage = (img: PickedImage) => {
    URL.revokeObjectURL(img.preview);
    setImages((prev) => prev.filter((x) => x !== img));
  };

  const pick = (files: FileList | null) => {
    // Copy first: clearing the input below empties the live FileList before React runs the updater.
    const picked = Array.from(files ?? [], (file) => ({ file, preview: URL.createObjectURL(file) }));
    if (picked.length) setImages((prev) => [...prev, ...picked]);
    if (input.current) input.current.value = '';
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const basePrice = sarToHalalas(form.price);
    if (basePrice === null) {
      setError(t('basePrice'));
      return;
    }
    setBusy(true);
    let product: { id: string };
    try {
      product = await adminCall<{ id: string }>(
        '/products',
        'POST',
        { categoryId: form.categoryId, nameAr: form.nameAr, nameEn: form.nameEn || undefined, pricingMode: form.pricingMode, basePrice },
        locale,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      return;
    }

    if (images.length) {
      try {
        const mediaIds: string[] = [];
        for (const { file } of images) {
          const data = new FormData();
          data.append('file', file);
          // Default alt text from the product name, as on the Images tab; editors refine it there.
          data.append('altAr', form.nameAr);
          if (form.nameEn) data.append('altEn', form.nameEn);
          mediaIds.push((await adminUpload<MediaDto>('media', data, locale)).id);
        }
        await adminCall(`/products/${product.id}/media`, 'PUT', { items: mediaIds.map((mediaId) => ({ mediaId, variantId: null })) }, locale);
      } catch (err) {
        setCreatedId(product.id);
        setError(t('imagesFailedAfterCreate', { error: err instanceof Error ? err.message : String(err) }));
        setBusy(false);
        return;
      }
    }
    router.push(`/catalog/products/${product.id}`);
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

        {canUpload && (
          <div className="flex flex-col gap-3 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink-900">{t('productImages')}</p>
                <p className="text-xs text-ink-500">{t('uploadHint')}</p>
              </div>
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" id="new-product-images" onChange={(e) => pick(e.target.files)} />
              <Button type="button" variant="secondary" disabled={busy || Boolean(createdId)} onClick={() => input.current?.click()}>
                {t('addImages')}
              </Button>
            </div>
            {images.length === 0 ? (
              <p className="text-sm text-ink-500">{t('noImages')}</p>
            ) : (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {images.map((img, i) => (
                  <li key={img.preview} className="relative aspect-[4/5] overflow-hidden rounded-xl bg-sand-100">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview before upload */}
                    <img src={img.preview} alt="" className="size-full object-cover" />
                    {i === 0 && <Badge className="absolute start-2 top-2 bg-brand-600 text-white">1</Badge>}
                    {!busy && !createdId && (
                      <button
                        type="button"
                        onClick={() => removeImage(img)}
                        aria-label={t('remove')}
                        className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-full bg-white/90 text-ink-900 shadow hover:bg-white"
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="sm:col-span-2">
          {createdId ? (
            <Link href={`/catalog/products/${createdId}`} className="inline-flex h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700">
              {t('openProduct')}
            </Link>
          ) : (
            <Button type="submit" loading={busy}>
              {t('create')}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

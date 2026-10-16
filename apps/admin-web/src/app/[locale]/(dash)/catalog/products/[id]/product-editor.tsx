'use client';

import { Alert, Badge, Button, Card, Progress, cn } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useState, type ReactNode } from 'react';
import { useRouter } from '@/i18n/navigation';
import { adminCall } from '@/lib/admin-client';
import type { AdminProduct, Location } from '@/lib/catalog-types';
import { AttributesTab } from './tab-attributes';
import { DetailsTab } from './tab-details';
import { MediaTab } from './tab-media';
import { PricingTab } from './tab-pricing';
import { VariantsTab } from './tab-variants';

export interface EditorContext {
  product: AdminProduct;
  /** Run a mutation; the API returns the updated product, which replaces local state. */
  mutate: (fn: () => Promise<AdminProduct | void>, successMessage?: string) => Promise<boolean>;
  busy: boolean;
  canWrite: boolean;
}

const TABS = ['details', 'pricing', 'attributes', 'variants', 'media'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  details: 'tabDetails',
  pricing: 'tabPricing',
  attributes: 'tabAttributes',
  variants: 'tabVariants',
  media: 'tabMedia',
};
const REQUIRED = new Set(['nameAr', 'descriptionAr', 'images', 'variants', 'price']);

export function ProductEditor({
  initial,
  categories,
  sizeGuides,
  templates,
  locations,
  permissions,
  storefrontUrl,
}: {
  initial: AdminProduct;
  categories: Array<{ id: string; label: string }>;
  sizeGuides: Array<{ id: string; titleAr: string; titleEn: string | null }>;
  templates: Array<{ id: string; code: string; kind: string; nameAr: string; nameEn: string }>;
  locations: Location[];
  permissions: { write: boolean; publish: boolean; media: boolean; stock: boolean };
  storefrontUrl: string;
}) {
  const t = useTranslations('catalog');
  const locale = useLocale();
  const router = useRouter();
  const [product, setProduct] = useState(initial);
  const [tab, setTab] = useState<Tab>('details');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string; details?: string[] } | null>(null);

  const mutate = useCallback<EditorContext['mutate']>(
    async (fn, successMessage) => {
      setBusy(true);
      setMessage(null);
      try {
        const next = await fn();
        if (next) setProduct(next);
        if (successMessage) setMessage({ tone: 'success', text: successMessage });
        return true;
      } catch (err) {
        const details = (err as { details?: { missing?: string[] } }).details?.missing?.map((m) => t(`missing_${m}` as never));
        setMessage({ tone: 'danger', text: err instanceof Error ? err.message : String(err), details });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const ctx: EditorContext = { product, mutate, busy, canWrite: permissions.write };
  const name = locale === 'en' ? product.nameEn || product.nameAr : product.nameAr;
  const statusTone = { DRAFT: 'bg-sand-200 text-ink-700', ACTIVE: 'bg-success-50 text-success-600', ARCHIVED: 'bg-danger-50 text-danger-600' }[product.status];

  let content: ReactNode;
  switch (tab) {
    case 'details':
      content = <DetailsTab ctx={ctx} />;
      break;
    case 'pricing':
      content = <PricingTab ctx={ctx} categories={categories} sizeGuides={sizeGuides} templates={templates} />;
      break;
    case 'attributes':
      content = <AttributesTab ctx={ctx} />;
      break;
    case 'variants':
      content = <VariantsTab ctx={ctx} locations={locations} canStock={permissions.stock} />;
      break;
    case 'media':
      content = <MediaTab ctx={ctx} canUpload={permissions.media} />;
      break;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-ink-500">
            <span dir="ltr">{product.skuPrefix}</span>
            <Badge className={statusTone}>{t(`status_${product.status}`)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {product.status === 'ACTIVE' && (
            <a href={`${storefrontUrl}/${locale}/p/${encodeURIComponent(locale === 'en' ? product.slugEn : product.slugAr)}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-xl border border-sand-300 bg-white px-3 text-sm hover:bg-sand-100">
              {t('viewInStore')}
            </a>
          )}
          {permissions.publish && product.status !== 'ACTIVE' && (
            <Button size="sm" loading={busy} onClick={() => mutate(() => adminCall<AdminProduct>(`/products/${product.id}/publish`, 'POST', {}, locale), t('saved'))}>
              {t('publish')}
            </Button>
          )}
          {permissions.publish && product.status === 'ACTIVE' && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => mutate(() => adminCall<AdminProduct>(`/products/${product.id}/unpublish`, 'POST', {}, locale))}>
              {t('unpublish')}
            </Button>
          )}
          {permissions.publish && product.status !== 'ARCHIVED' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => mutate(() => adminCall<AdminProduct>(`/products/${product.id}/archive`, 'POST', {}, locale))}>
              {t('archive')}
            </Button>
          )}
          {permissions.write && (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm(t('confirmDelete'))) return;
                const ok = await mutate(() => adminCall(`/products/${product.id}`, 'DELETE', undefined, locale));
                if (ok) router.replace('/catalog/products');
              }}
            >
              {t('delete')}
            </Button>
          )}
        </div>
      </div>

      <Card className="mt-6 grid gap-4 p-5 sm:grid-cols-[1fr_1fr_2fr]">
        <Progress value={product.completeness.ar} label={t('languageProgress', { language: t('arabic'), percent: product.completeness.ar })} />
        <Progress value={product.completeness.en} label={t('languageProgress', { language: t('english'), percent: product.completeness.en })} />
        {product.completeness.missing.length > 0 && (
          <div>
            <div className="text-xs text-ink-700">{t('missingTitle')}</div>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {product.completeness.missing.map((m) => (
                <li key={m}>
                  <Badge className={REQUIRED.has(m) ? 'bg-danger-50 text-danger-600' : undefined}>
                    {t(`missing_${m}`)}
                    {REQUIRED.has(m) && <span className="sr-only"> ({t('requiredToPublish')})</span>}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {message && (
        <Alert tone={message.tone} className="mt-4">
          {message.text}
          {message.details?.length ? <span className="block">{message.details.join(' · ')}</span> : null}
        </Alert>
      )}

      <div role="tablist" aria-label={name} className="mt-6 flex gap-1 overflow-x-auto border-b border-sand-200">
        {TABS.map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap',
              tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900',
            )}
          >
            {t(TAB_LABEL[key])}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-6">
        {content}
      </div>
    </div>
  );
}

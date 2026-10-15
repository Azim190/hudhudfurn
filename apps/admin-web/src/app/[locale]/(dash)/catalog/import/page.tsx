import { isLocale } from '@hudhud/i18n';
import { Alert } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { can, requireAdmin } from '@/lib/server';
import { ImportPanel } from './import-panel';

const COLUMNS = [
  'sku_prefix',
  'category_slug',
  'name_ar',
  'name_en',
  'description_ar',
  'description_en',
  'care_ar',
  'care_en',
  'pricing_mode',
  'base_price_sar',
  'compare_at_sar',
  'status',
  'made_to_measure',
  'product_attributes',
  'variant_sku',
  'variant_options',
  'variant_price_sar',
  'variant_compare_at_sar',
  'stock',
  'location_code',
];

export default async function ImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  const t = await getTranslations();
  if (!can(me, 'catalog.product.import')) return <Alert>{t('admin.noAccess')}</Alert>;
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">{t('admin.importExport')}</h1>
      <ImportPanel columns={COLUMNS} />
    </div>
  );
}

import { isLocale } from '@hudhud/i18n';
import { Alert } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { flattenCategories, type CategoryNode } from '@/lib/catalog-types';
import { adminApi, can, requireAdmin } from '@/lib/server';
import { NewProductForm } from './new-product-form';

export default async function NewProductPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  const t = await getTranslations();
  if (!can(me, 'catalog.product.write')) return <Alert>{t('admin.noAccess')}</Alert>;
  const tree = await adminApi<CategoryNode[]>('/admin/categories', locale);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">{t('catalog.newProduct')}</h1>
      <NewProductForm categories={flattenCategories(tree).map((c) => ({ id: c.id, label: `${'— '.repeat(c.depth)}${locale === 'en' ? c.nameEn || c.nameAr : c.nameAr}` }))} />
    </div>
  );
}

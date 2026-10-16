import { isLocale } from '@hudhud/i18n';
import { Alert } from '@hudhud/ui';
import { ApiError } from '@hudhud/web-core';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { AdminProduct, CategoryNode, Location } from '@/lib/catalog-types';
import { flattenCategories } from '@/lib/catalog-types';
import { adminApi, can, requireAdmin } from '@/lib/server';
import { ProductEditor } from './product-editor';

export default async function ProductEditorPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireAdmin(locale);
  if (!can(me, 'catalog.product.read')) return <Alert>{(await getTranslations('admin'))('noAccess')}</Alert>;

  let product: AdminProduct;
  try {
    product = await adminApi<AdminProduct>(`/admin/products/${id}`, locale);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const [tree, sizeGuides, locations, templates] = await Promise.all([
    adminApi<CategoryNode[]>('/admin/categories', locale),
    adminApi<Array<{ id: string; titleAr: string; titleEn: string | null }>>('/admin/size-guides', locale),
    can(me, 'inventory.read') ? adminApi<Location[]>('/admin/locations', locale) : Promise.resolve([] as Location[]),
    can(me, 'settings.read') ? adminApi<Array<{ id: string; code: string; kind: string; nameAr: string; nameEn: string; isActive: boolean }>>('/admin/configurator/templates', locale) : Promise.resolve([]),
  ]);

  return (
    <ProductEditor
      initial={product}
      categories={flattenCategories(tree).map((c) => ({ id: c.id, label: `${'— '.repeat(c.depth)}${locale === 'en' ? c.nameEn || c.nameAr : c.nameAr}` }))}
      sizeGuides={sizeGuides}
      templates={templates.filter((tpl) => tpl.isActive || tpl.id === product.configuratorTemplateId)}
      locations={locations.filter((l) => l.isActive)}
      permissions={{
        write: can(me, 'catalog.product.write'),
        publish: can(me, 'catalog.product.publish'),
        media: can(me, 'catalog.media.write'),
        stock: can(me, 'inventory.adjust'),
      }}
      storefrontUrl={process.env.STOREFRONT_URL ?? 'http://localhost:3100'}
    />
  );
}

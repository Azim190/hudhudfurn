import { isLocale } from '@hudhud/i18n';
import { Alert } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import type { Attribute, CategoryNode } from '@/lib/catalog-types';
import { adminApi, can, requireAdmin } from '@/lib/server';
import { CategoryManager } from './category-manager';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale: isLocale(locale) ? locale : 'ar', namespace: 'catalog' }))('categories') };
}

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  if (!can(me, 'catalog.category.read')) return <Alert>{(await getTranslations('admin'))('noAccess')}</Alert>;
  const [tree, attributes] = await Promise.all([
    adminApi<CategoryNode[]>('/admin/categories', locale),
    can(me, 'catalog.attribute.read') ? adminApi<Attribute[]>('/admin/attributes', locale) : Promise.resolve([] as Attribute[]),
  ]);
  return <CategoryManager initialTree={tree} attributes={attributes} canWrite={can(me, 'catalog.category.write')} />;
}

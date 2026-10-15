import { isLocale } from '@hudhud/i18n';
import { Alert } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import type { Attribute } from '@/lib/catalog-types';
import { adminApi, can, requireAdmin } from '@/lib/server';
import { AttributeManager } from './attribute-manager';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale: isLocale(locale) ? locale : 'ar', namespace: 'catalog' }))('attributes') };
}

export default async function AttributesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  if (!can(me, 'catalog.attribute.read')) return <Alert>{(await getTranslations('admin'))('noAccess')}</Alert>;
  const attributes = await adminApi<Attribute[]>('/admin/attributes', locale);
  return <AttributeManager initial={attributes} canWrite={can(me, 'catalog.attribute.write')} />;
}

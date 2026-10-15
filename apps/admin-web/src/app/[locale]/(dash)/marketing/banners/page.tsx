import { isLocale } from '@hudhud/i18n';
import { Alert } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { adminApi, can, requireAdmin } from '@/lib/server';
import { BannerManager, type AdminBanner } from './banner-manager';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale: isLocale(locale) ? locale : 'ar', namespace: 'marketing' }))('banners') };
}

export default async function BannersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  if (!can(me, 'marketing.read')) return <Alert>{(await getTranslations('admin'))('noAccess')}</Alert>;
  const banners = await adminApi<AdminBanner[]>('/admin/banners', locale);
  return <BannerManager initial={banners} canWrite={can(me, 'marketing.write') && can(me, 'catalog.media.write')} />;
}

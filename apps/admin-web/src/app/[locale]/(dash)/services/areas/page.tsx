import { isLocale } from '@hudhud/i18n';
import { Alert } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { adminApi, can, requireAdmin } from '@/lib/server';
import { AreaManager, type Area } from './area-manager';

export default async function ServiceAreasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  if (!can(me, 'services.read')) return <Alert>{(await getTranslations('admin'))('noAccess')}</Alert>;
  const [areas, cities] = await Promise.all([adminApi<Area[]>('/admin/services/areas', locale), adminApi<Array<{ code: string; nameAr: string; nameEn: string }>>('/geo/cities', locale)]);
  return <AreaManager initial={areas} cities={cities} canManage={can(me, 'services.manage')} />;
}

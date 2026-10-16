import { isLocale } from '@hudhud/i18n';
import { Alert } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { adminApi, can, requireAdmin } from '@/lib/server';
import { TechnicianManager, type Technician } from './technician-manager';

export default async function TechniciansPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  if (!can(me, 'services.read')) return <Alert>{(await getTranslations('admin'))('noAccess')}</Alert>;
  const [technicians, areas] = await Promise.all([
    adminApi<Technician[]>('/admin/services/technicians', locale),
    adminApi<Array<{ id: string; nameAr: string; nameEn: string }>>('/admin/services/areas', locale),
  ]);
  return <TechnicianManager initial={technicians} areas={areas} canManage={can(me, 'services.manage')} />;
}

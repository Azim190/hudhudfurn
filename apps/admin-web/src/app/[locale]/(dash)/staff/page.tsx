import { isLocale } from '@hudhud/i18n';
import { Alert } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { adminApi, can, requireAdmin } from '@/lib/server';
import { StaffManager, type RoleOption, type StaffRow } from './staff-manager';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale: isLocale(locale) ? locale : 'ar', namespace: 'admin' }))('staff') };
}

export default async function StaffPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  const t = await getTranslations('admin');
  if (!can(me, 'rbac.read')) return <Alert>{t('noAccess')}</Alert>;

  const [staff, roles] = await Promise.all([
    adminApi<StaffRow[]>('/admin/staff', locale),
    adminApi<RoleOption[]>('/admin/roles', locale),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">{t('staff')}</h1>
      <StaffManager
        initialStaff={staff}
        roles={roles}
        canWrite={can(me, 'rbac.write')}
        isOwner={me.roles.includes('owner')}
        currentUserId={me.id}
      />
    </div>
  );
}

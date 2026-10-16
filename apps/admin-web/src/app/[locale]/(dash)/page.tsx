import { isLocale } from '@hudhud/i18n';
import { Badge, Card } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { can, requireAdmin } from '@/lib/server';

export default async function OverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  // Field staff start on their job list.
  if (!can(me, 'dashboard.view') && can(me, 'services.technician')) redirect({ href: '/technician', locale });
  const t = await getTranslations('admin');

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">{t('welcome', { name: me.fullName ?? me.email ?? '' })}</h1>
      <Card className="mt-6 p-6">
        <h2 className="text-sm font-medium text-ink-500">{t('yourRoles')}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {me.roleNames.map((r) => (
            <Badge key={r.key}>{locale === 'ar' ? r.nameAr : r.nameEn}</Badge>
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-700">{t('yourPermissions', { count: me.permissions.length })}</p>
      </Card>
    </div>
  );
}

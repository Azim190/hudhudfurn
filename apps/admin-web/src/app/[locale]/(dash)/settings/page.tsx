import { isLocale } from '@hudhud/i18n';
import { Alert } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { adminApi, can, requireAdmin } from '@/lib/server';
import { StorefrontSettingsForm, type StorefrontSettings } from './storefront-settings-form';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  if (!can(me, 'settings.read')) return <Alert>{(await getTranslations('admin'))('noAccess')}</Alert>;
  const settings = await adminApi<StorefrontSettings>('/admin/settings/storefront', locale);
  return <StorefrontSettingsForm initial={settings} canEdit={can(me, 'settings.write')} />;
}

import { isLocale } from '@hudhud/i18n';
import { Alert } from '@hudhud/ui';
import { ApiError } from '@hudhud/web-core';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { adminApi, can, requireAdmin } from '@/lib/server';
import { TemplateEditor, type AdminTemplate } from './template-editor';

export default async function TemplatePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireAdmin(locale);
  if (!can(me, 'settings.read')) return <Alert>{(await getTranslations('admin'))('noAccess')}</Alert>;
  let template: AdminTemplate;
  try {
    template = await adminApi<AdminTemplate>(`/admin/configurator/templates/${id}`, locale);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  return <TemplateEditor initial={template} canWrite={can(me, 'settings.configurator')} />;
}

import { isLocale } from '@hudhud/i18n';
import { Alert } from '@hudhud/ui';
import { ApiError } from '@hudhud/web-core';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { can, requireAdmin, technicianApi } from '@/lib/server';
import { JobScreen, type CatalogProduct, type JobDetail } from './job-screen';

export default async function TechnicianJobPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireAdmin(locale);
  if (!can(me, 'services.technician')) return <Alert>{(await getTranslations('admin'))('noAccess')}</Alert>;
  let job: JobDetail;
  try {
    job = await technicianApi<JobDetail>(`/technician/jobs/${id}`, locale);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const catalog = job.type === 'MEASUREMENT' ? await technicianApi<CatalogProduct[]>('/technician/catalog', locale) : [];
  return <JobScreen initial={job} catalog={catalog} />;
}

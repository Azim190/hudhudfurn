import { formatDate, isLocale } from '@hudhud/i18n';
import { Alert, Card } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { adminApi, can, requireAdmin } from '@/lib/server';

interface AuditItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  at: string;
  actor: { id: string; fullName: string | null; email: string | null } | null;
}

const PAGE_SIZE = 50;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale: isLocale(locale) ? locale : 'ar', namespace: 'admin' }))('auditLog') };
}

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  const t = await getTranslations('admin');
  if (!can(me, 'audit.view')) return <Alert>{t('noAccess')}</Alert>;

  const page = Math.max(1, Number((await searchParams).page) || 1);
  const data = await adminApi<{ items: AuditItem[]; total: number }>(`/admin/audit-logs?page=${page}&limit=${PAGE_SIZE}`, locale);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">{t('auditLog')}</h1>
      <Card className="mt-6 overflow-x-auto">
        {data.items.length === 0 ? (
          <p className="p-6 text-sm text-ink-500">{t('noResults')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-sand-200 text-xs text-ink-500">
              <tr>
                {[t('time'), t('actor'), t('action'), t('entity'), 'IP'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-start font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-b border-sand-100 last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-ink-500">
                    {formatDate(item.at, { locale, digits: 'western' }, { dateStyle: 'medium', timeStyle: 'medium' })}
                  </td>
                  <td className="px-4 py-3">{item.actor?.fullName ?? item.actor?.email ?? t('system')}</td>
                  <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                    <span className="block text-start">{item.action}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-500" dir="ltr">
                    <span className="block text-start">{[item.entityType, item.entityId?.slice(0, 8)].filter(Boolean).join(':')}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-500" dir="ltr">
                    <span className="block text-start">{item.ip}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="pagination">
          {page > 1 ? <Link href={`/audit?page=${page - 1}`}>{t('previous')}</Link> : <span />}
          <span className="text-ink-500">{t('page', { page, pages })}</span>
          {page < pages ? <Link href={`/audit?page=${page + 1}`}>{t('next')}</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

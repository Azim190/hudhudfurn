import { isLocale } from '@hudhud/i18n';
import { Alert, Badge, Card } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { adminApi, can, requireAdmin } from '@/lib/server';

interface TemplateRow {
  id: string;
  code: string;
  kind: string;
  nameAr: string;
  nameEn: string;
  version: number;
  isActive: boolean;
  _count: { products: number };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale: isLocale(locale) ? locale : 'ar', namespace: 'admin' }))('configurator') };
}

export default async function ConfiguratorTemplatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  const t = await getTranslations('admin');
  if (!can(me, 'settings.read')) return <Alert>{t('noAccess')}</Alert>;
  const templates = await adminApi<TemplateRow[]>('/admin/configurator/templates', locale);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">{t('configurator')}</h1>
      <Card className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-sand-200 text-xs text-ink-500">
            <tr>
              {[t('name'), t('code'), t('kind'), t('version'), t('productsUsing'), t('status')].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => (
              <tr key={tpl.id} className="border-b border-sand-100 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/configurator/${tpl.id}`} className="font-medium text-brand-700 hover:underline">
                    {locale === 'en' ? tpl.nameEn : tpl.nameAr}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                  <span className="block text-start">{tpl.code}</span>
                </td>
                <td className="px-4 py-3">{tpl.kind}</td>
                <td className="px-4 py-3">v{tpl.version}</td>
                <td className="px-4 py-3">{tpl._count.products}</td>
                <td className="px-4 py-3">
                  <Badge className={tpl.isActive ? 'bg-success-50 text-success-600' : ''}>{tpl.isActive ? t('active') : t('blocked')}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

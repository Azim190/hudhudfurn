import { formatDate, formatPrice, isLocale } from '@hudhud/i18n';
import { Alert, Badge, Card } from '@hudhud/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { flattenCategories, type CategoryNode, type ProductListItem } from '@/lib/catalog-types';
import { adminApi, can, requireAdmin } from '@/lib/server';

const PAGE_SIZE = 25;
const STATUS_TONE = { DRAFT: 'bg-sand-200 text-ink-700', ACTIVE: 'bg-success-50 text-success-600', ARCHIVED: 'bg-danger-50 text-danger-600' } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale: isLocale(locale) ? locale : 'ar', namespace: 'catalog' }))('products') };
}

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; categoryId?: string; page?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  const t = await getTranslations('catalog');
  if (!can(me, 'catalog.product.read')) return <Alert>{(await getTranslations('admin'))('noAccess')}</Alert>;

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (sp.q) qs.set('q', sp.q);
  if (sp.status && ['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(sp.status)) qs.set('status', sp.status);
  if (sp.categoryId && /^[0-9a-f-]{36}$/.test(sp.categoryId)) qs.set('categoryId', sp.categoryId);

  const [data, tree] = await Promise.all([
    adminApi<{ items: ProductListItem[]; total: number }>(`/admin/products?${qs}`, locale),
    adminApi<CategoryNode[]>('/admin/categories', locale),
  ]);
  const categories = flattenCategories(tree);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const name = (x: { nameAr: string; nameEn: string | null }) => (locale === 'en' ? x.nameEn || x.nameAr : x.nameAr);
  const pageHref = (p: number) => {
    const next = new URLSearchParams(qs);
    next.set('page', String(p));
    next.delete('limit');
    return `/catalog/products?${next}`;
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('products')}</h1>
        {can(me, 'catalog.product.write') && (
          <Link href="/catalog/products/new" className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
            {t('newProduct')}
          </Link>
        )}
      </div>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <input
          name="q"
          defaultValue={sp.q}
          placeholder={t('searchProducts')}
          aria-label={t('searchProducts')}
          className="h-11 min-w-64 flex-1 rounded-xl border border-sand-300 bg-white px-4"
        />
        <select name="status" defaultValue={sp.status ?? ''} aria-label={t('allStatuses')} className="h-11 rounded-xl border border-sand-300 bg-white px-3">
          <option value="">{t('allStatuses')}</option>
          {(['DRAFT', 'ACTIVE', 'ARCHIVED'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`status_${s}`)}
            </option>
          ))}
        </select>
        <select name="categoryId" defaultValue={sp.categoryId ?? ''} aria-label={t('allCategories')} className="h-11 rounded-xl border border-sand-300 bg-white px-3">
          <option value="">{t('allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {'— '.repeat(c.depth)}
              {name(c)}
            </option>
          ))}
        </select>
        <button className="h-11 rounded-xl border border-sand-300 bg-white px-4 text-sm font-medium hover:bg-sand-100">{(await getTranslations('common'))('search')}</button>
      </form>

      <Card className="mt-6 overflow-x-auto">
        {data.items.length === 0 ? (
          <p className="p-8 text-center text-ink-500">{t('noProducts')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-sand-200 text-xs text-ink-500">
              <tr>
                {[t('product'), t('category'), t('price'), t('stock'), t('completeness'), t('updated')].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-start font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50">
                  <td className="px-4 py-3">
                    <Link href={`/catalog/products/${p.id}`} className="flex items-center gap-3">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- CDN thumbnail, already resized
                        <img src={p.image.thumbnailUrl} alt="" width={40} height={50} className="h-12 w-10 rounded-md object-cover" />
                      ) : (
                        <span className="h-12 w-10 rounded-md bg-sand-200" />
                      )}
                      <span>
                        <span className="block font-medium text-ink-900">{name(p)}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
                          <span dir="ltr">{p.skuPrefix}</span>
                          <Badge className={STATUS_TONE[p.status]}>{t(`status_${p.status}`)}</Badge>
                          <span>{t('variantsCount', { count: p.variantCount })}</span>
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{name(p.category)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatPrice(p.price, { locale, digits: 'western' })}</td>
                  <td className="px-4 py-3">{p.isMadeToMeasure ? '—' : p.totalStock}</td>
                  <td className="px-4 py-3">
                    <span className={p.completeness >= 80 ? 'text-success-600' : p.completeness >= 50 ? 'text-ink-700' : 'text-danger-600'}>{p.completeness}%</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-500">{formatDate(p.updatedAt, { locale, digits: 'western' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="pagination">
          {page > 1 ? <Link href={pageHref(page - 1)}>{(await getTranslations('admin'))('previous')}</Link> : <span />}
          <span className="text-ink-500">{(await getTranslations('admin'))('page', { page, pages })}</span>
          {page < pages ? <Link href={pageHref(page + 1)}>{(await getTranslations('admin'))('next')}</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

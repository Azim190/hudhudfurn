import { ChevronForward } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { siteUrl } from '@/lib/seo';

export interface Crumb {
  label: string;
  href?: string;
}

/** Visible breadcrumb trail plus schema.org BreadcrumbList for search engines. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const all: Crumb[] = [{ label: t('home'), href: '/' }, ...items];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: `${siteUrl()}/${locale}${c.href === '/' ? '' : c.href}` } : {}),
    })),
  };
  return (
    <nav aria-label="breadcrumb" className="text-sm text-ink-500">
      <ol className="flex flex-wrap items-center gap-1">
        {all.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronForward className="size-3.5 opacity-60" />}
            {c.href && i < all.length - 1 ? (
              <Link href={c.href} className="hover:text-brand-700 hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink-700">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </nav>
  );
}

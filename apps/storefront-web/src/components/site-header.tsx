import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { AccountLink, DigitToggle, LanguageSwitcher } from './locale-controls';

const CATEGORY_LINKS = [
  { href: '/c/curtains', key: 'nav.curtains' },
  { href: '/c/bedding', key: 'nav.bedding' },
  { href: '/c/sofa-covers', key: 'nav.sofaCovers' },
  { href: '/c/abayas', key: 'nav.abayas' },
] as const;

/** Cookie-free on the server so every page that uses it stays cacheable (ISR). */
export async function SiteHeader() {
  const t = await getTranslations();
  return (
    <header className="sticky top-0 z-30 border-b border-sand-200 bg-sand-50/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="text-2xl font-bold tracking-tight text-brand-700">
          {t('common.storeName')}
        </Link>
        <nav aria-label={t('a11y.mainNavigation')} className="hidden flex-1 lg:block">
          <ul className="flex items-center gap-1">
            {CATEGORY_LINKS.map((c) => (
              <li key={c.href}>
                <Link href={c.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-sand-100">
                  {t(c.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ms-auto flex items-center gap-1">
          <DigitToggle />
          <LanguageSwitcher />
          <AccountLink />
        </div>
      </div>
      <nav aria-label={t('a11y.mainNavigation')} className="border-t border-sand-200 lg:hidden">
        <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2">
          {CATEGORY_LINKS.map((c) => (
            <li key={c.href} className="shrink-0">
              <Link href={c.href} className="block rounded-lg px-3 py-1.5 text-sm text-ink-700 hover:bg-sand-100">
                {t(c.key)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getCategoryTree } from '@/lib/catalog-api';
import { HeaderActions } from './header-actions';
import { HeaderSearch } from './header-search';
import { AccountLink, DigitToggle, LanguageSwitcher } from './locale-controls';
import { MegaMenu, MobileMenu } from './mega-menu';

/** Cookie-free on the server so every page that uses it stays cacheable (ISR). */
export async function SiteHeader() {
  const [t, tree] = await Promise.all([getTranslations(), getCategoryTree().catch(() => [])]);
  return (
    <header className="sticky top-0 z-30 border-b border-sand-200 bg-sand-50/95 backdrop-blur print:hidden">
      <div className="relative">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <MobileMenu tree={tree} />
          <Link href="/" className="shrink-0 text-xl font-bold tracking-tight text-brand-700 sm:text-2xl">
            {t('common.storeName')}
          </Link>
          <MegaMenu tree={tree} />
          <HeaderSearch className="ms-auto hidden w-full max-w-xs xl:block" />
          <div className="ms-auto flex items-center gap-0.5 sm:gap-1 xl:ms-2">
            {/* On phones the digits preference lives in the mobile menu. */}
            <span className="hidden sm:contents">
              <DigitToggle />
            </span>
            <LanguageSwitcher />
            <HeaderActions />
            <AccountLink />
          </div>
        </div>
      </div>
      <div className="px-4 pb-3 xl:hidden">
        <HeaderSearch />
      </div>
    </header>
  );
}

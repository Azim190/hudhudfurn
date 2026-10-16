import { isLocale } from '@hudhud/i18n';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LanguageSwitcher, SignOutButton } from '@/components/language-switcher';
import { SidebarNav } from '@/components/sidebar-nav';
import { can, requireAdmin } from '@/lib/server';

/** Every dashboard page requires a staff session with completed 2FA. */
export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/', key: 'admin.dashboard', permission: 'dashboard.view' },
  { href: '/orders', key: 'admin.orders', permission: 'orders.read' },
  { href: '/catalog/products', key: 'catalog.products', permission: 'catalog.product.read' },
  { href: '/catalog/categories', key: 'catalog.categories', permission: 'catalog.category.read' },
  { href: '/catalog/attributes', key: 'catalog.attributes', permission: 'catalog.attribute.read' },
  { href: '/catalog/import', key: 'admin.importExport', permission: 'catalog.product.import' },
  { href: '/marketing/banners', key: 'marketing.banners', permission: 'marketing.read' },
  { href: '/configurator', key: 'admin.configurator', permission: 'settings.read' },
  { href: '/staff', key: 'admin.staff', permission: 'rbac.read' },
  { href: '/audit', key: 'admin.auditLog', permission: 'audit.view' },
] as const;

export default async function DashboardLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await requireAdmin(locale);
  const t = await getTranslations();
  const items = NAV.filter((n) => can(me, n.permission)).map((n) => ({ href: n.href, label: t(n.key) }));

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 border-e border-sand-200 bg-white md:block">
        <div className="px-6 py-5 text-xl font-bold text-brand-700">{t('common.storeName')}</div>
        <SidebarNav items={items} label={t('a11y.mainNavigation')} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-2 border-b border-sand-200 bg-white px-4 sm:px-6">
          <div className="md:hidden">
            <SidebarNav items={items} label={t('a11y.mainNavigation')} compact />
          </div>
          <span className="ms-auto text-sm text-ink-700">{me.fullName ?? me.email}</span>
          <LanguageSwitcher />
          <SignOutButton />
        </header>
        <main className="flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}

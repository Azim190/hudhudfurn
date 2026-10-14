'use client';

import { cn } from '@hudhud/ui';
import { Link, usePathname } from '@/i18n/navigation';

export function SidebarNav({ items, label, compact }: { items: Array<{ href: string; label: string }>; label: string; compact?: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <nav aria-label={label}>
      <ul className={cn(compact ? 'flex gap-1 overflow-x-auto' : 'flex flex-col gap-1 px-3')}>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'block rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap',
                isActive(item.href) ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-sand-100',
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

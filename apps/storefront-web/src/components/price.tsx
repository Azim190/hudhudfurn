'use client';

import { formatPrice, type Locale } from '@hudhud/i18n';
import { cn } from '@hudhud/ui';
import { useLocale } from 'next-intl';
import { useCookie } from '@/lib/client-cookies';

/** Formats SAR amounts with the visitor's digit preference (cookie; Western digits on the server). */
export function usePriceFormatter() {
  const locale = useLocale() as Locale;
  const digits = useCookie('hd_digits') === 'arabic_indic' ? 'arabic_indic' : 'western';
  return (halalas: number) => formatPrice(halalas, { locale, digits });
}

export function Price({
  amount,
  compareAt,
  className,
  size = 'md',
}: {
  amount: number;
  compareAt?: number | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const format = usePriceFormatter();
  const sizes = { sm: 'text-sm', md: 'text-base', lg: 'text-2xl' };
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      <span className={cn('font-semibold text-ink-900', sizes[size])}>{format(amount)}</span>
      {compareAt && compareAt > amount ? <s className="text-sm text-ink-500">{format(compareAt)}</s> : null}
    </span>
  );
}

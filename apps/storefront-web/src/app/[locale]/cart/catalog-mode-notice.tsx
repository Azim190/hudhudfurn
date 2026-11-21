'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useStoreDisplay, whatsappHref } from '@/components/store-display';
import { Link } from '@/i18n/navigation';

/** While prices are hidden the cart is replaced by a pointer to WhatsApp ordering. */
export function CatalogModeNotice({ children }: { children: ReactNode }) {
  const t = useTranslations('shop');
  const { showPrices, whatsapp } = useStoreDisplay();
  if (showPrices) return <>{children}</>;
  const href = whatsappHref(whatsapp, t('catalogModeWhatsAppText'));
  return (
    <div className="mt-6 flex flex-col items-start gap-4 rounded-card border border-sand-200 bg-white p-6" data-testid="catalog-mode-notice">
      <p className="text-ink-700">{t('catalogModeCart')}</p>
      <div className="flex flex-wrap gap-3">
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-xl bg-success-600 px-5 text-sm font-medium text-white">
            {t('orderOnWhatsApp')}
          </a>
        )}
        <Link href="/" className="inline-flex h-11 items-center rounded-xl border border-sand-300 px-5 text-sm font-medium hover:bg-sand-100">
          {t('continueShopping')}
        </Link>
      </div>
    </div>
  );
}

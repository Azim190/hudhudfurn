'use client';

import { cn } from '@hudhud/ui';
import { useTranslations } from 'next-intl';
import { toggleWishlist, useWishlist } from '@/lib/shop-store';

export function WishlistButton({ productId, productName, variant = 'icon' }: { productId: string; productName: string; variant?: 'icon' | 'button' }) {
  const t = useTranslations('shop');
  const saved = useWishlist().includes(productId);
  const label = `${saved ? t('removeFromWishlist') : t('addToWishlist')}: ${productName}`;

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={label}
      title={saved ? t('removeFromWishlist') : t('addToWishlist')}
      onClick={(e) => {
        e.preventDefault();
        void toggleWishlist(productId);
      }}
      className={cn(
        // Above the card's stretched link.
        'relative z-10 inline-flex items-center justify-center gap-2 transition',
        variant === 'icon' ? 'size-9 rounded-full bg-white/90 shadow-sm hover:bg-white' : 'h-12 rounded-xl border border-sand-300 bg-white px-4 text-sm font-medium hover:bg-sand-100',
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-5', saved ? 'fill-danger-600 stroke-danger-600' : 'fill-none stroke-ink-700')} strokeWidth="1.8">
        <path d="M12 20.5s-7.5-4.6-9.3-9.3C1.4 7.6 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.1 4.3 6.7C19.5 15.9 12 20.5 12 20.5Z" strokeLinejoin="round" />
      </svg>
      {variant === 'button' && <span>{saved ? t('removeFromWishlist') : t('addToWishlist')}</span>}
    </button>
  );
}

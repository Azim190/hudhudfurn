'use client';

import { Spinner } from '@hudhud/ui';
import { STOREFRONT_COOKIES } from '@hudhud/web-core/cookie-names';
import { useTranslations } from 'next-intl';
import { ProductCard } from '@/components/product-card';
import { useProductCards } from '@/components/recently-viewed';
import { Link } from '@/i18n/navigation';
import { useCookie } from '@/lib/client-cookies';
import { useWishlist } from '@/lib/shop-store';

export function WishlistView() {
  const t = useTranslations('shop');
  const tNav = useTranslations('nav');
  const signedIn = useCookie(STOREFRONT_COOKIES.hint) === '1';
  const ids = useWishlist();
  const cards = useProductCards(ids.slice(0, 24));

  return (
    <div className="mt-6">
      {!signedIn && (
        <p className="mb-6 rounded-lg bg-sand-100 px-4 py-3 text-sm text-ink-700">
          {t('wishlistGuestHint')}{' '}
          <Link href="/login?next=/wishlist" className="font-medium text-brand-700 underline">
            {tNav('login')}
          </Link>
        </p>
      )}
      {cards === null ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-8 text-brand-600" />
        </div>
      ) : cards.length === 0 ? (
        <p className="py-16 text-center text-ink-500">{t('wishlistEmpty')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

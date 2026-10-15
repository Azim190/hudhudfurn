'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { CART_EVENT, useCompare, useWishlist } from '@/lib/shop-store';

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span aria-hidden="true" className="absolute -end-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] leading-5 font-semibold text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

const iconLink = 'relative inline-flex size-10 items-center justify-center rounded-lg text-ink-900 hover:bg-sand-100';

export function HeaderActions() {
  const t = useTranslations();
  const wishlist = useWishlist().length;
  const compare = useCompare().length;
  const [cart, setCart] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/bff/cart/count', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d: { count: number }) => setCart(d.count))
      .catch(() => undefined);
    const onCart = (e: Event) => setCart((e as CustomEvent<number>).detail);
    window.addEventListener(CART_EVENT, onCart);
    return () => {
      ctrl.abort();
      window.removeEventListener(CART_EVENT, onCart);
    };
  }, []);

  return (
    <div className="flex items-center">
      {compare > 0 && (
        <Link href="/compare" className={`${iconLink} hidden sm:inline-flex`} aria-label={t('shop.compareCount', { count: compare })}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current" strokeWidth="1.8">
            <path d="M7 4v16M17 4v16M3 8h8M13 16h8" strokeLinecap="round" />
          </svg>
          <Badge count={compare} />
        </Link>
      )}
      <Link href="/wishlist" className={iconLink} aria-label={`${t('nav.wishlist')}${wishlist ? ` (${wishlist})` : ''}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current" strokeWidth="1.8">
          <path d="M12 20.5s-7.5-4.6-9.3-9.3C1.4 7.6 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.1 4.3 6.7C19.5 15.9 12 20.5 12 20.5Z" strokeLinejoin="round" />
        </svg>
        <Badge count={wishlist} />
      </Link>
      <Link href="/cart" className={iconLink} aria-label={`${t('nav.cart')}${cart ? ` (${cart})` : ''}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current" strokeWidth="1.8">
          <path d="M5 7h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 7Z" strokeLinejoin="round" />
          <path d="M9 9V6a3 3 0 0 1 6 0v3" strokeLinecap="round" />
        </svg>
        <Badge count={cart} />
      </Link>
    </div>
  );
}

'use client';

import { STOREFRONT_COOKIES } from '@hudhud/web-core/cookie-names';
import { useSyncExternalStore } from 'react';

/**
 * Client-side shop state: wishlist (account-backed when signed in, device-local for guests),
 * compare list and recently viewed. Changes broadcast a window event so every consumer re-renders.
 */
const EVENT = 'hd:shop';
const KEYS = { wishlist: 'hd_wishlist', compare: 'hd_compare', recent: 'hd_recent' } as const;
export const COMPARE_LIMIT = 4;
const RECENT_LIMIT = 12;

const emit = () => window.dispatchEvent(new Event(EVENT));

function readList(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 200) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Storage may be unavailable (private mode); the feature degrades to in-memory for this page.
  }
  emit();
}

const signedIn = () => document.cookie.split('; ').some((c) => c === `${STOREFRONT_COOKIES.hint}=1`);

// ───── Wishlist ─────
let accountWishlist: string[] | null = null;
let loading: Promise<void> | null = null;

function loadAccountWishlist() {
  loading ??= fetch('/bff/wishlist/ids')
    .then((r) => (r.ok ? r.json() : []))
    .then((ids: string[]) => {
      accountWishlist = ids;
      emit();
    })
    .catch(() => {
      accountWishlist = [];
    });
  return loading;
}

function wishlistSnapshot(): string[] {
  if (signedIn()) {
    if (accountWishlist === null) void loadAccountWishlist();
    return accountWishlist ?? EMPTY;
  }
  return cachedLocal(KEYS.wishlist);
}

export async function toggleWishlist(productId: string): Promise<boolean> {
  if (signedIn()) {
    await loadAccountWishlist();
    const has = accountWishlist!.includes(productId);
    const res = await fetch(has ? `/bff/wishlist/${productId}` : '/bff/wishlist', {
      method: has ? 'DELETE' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: has ? undefined : JSON.stringify({ productIds: [productId] }),
    });
    if (res.ok) {
      accountWishlist = (await res.json()) as string[];
      emit();
    }
    return !has;
  }
  const list = readList(KEYS.wishlist);
  const has = list.includes(productId);
  writeList(KEYS.wishlist, has ? list.filter((id) => id !== productId) : [productId, ...list]);
  return !has;
}

/** After sign-in: move the device wishlist into the account. */
export async function mergeGuestWishlist(): Promise<void> {
  const local = readList(KEYS.wishlist);
  accountWishlist = null;
  loading = null;
  if (local.length) {
    const res = await fetch('/bff/wishlist', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productIds: local }) }).catch(() => null);
    if (res?.ok) writeList(KEYS.wishlist, []);
  }
  emit();
}

// ───── Compare & recently viewed ─────
export function toggleCompare(productId: string): 'added' | 'removed' | 'full' {
  const list = readList(KEYS.compare);
  if (list.includes(productId)) {
    writeList(KEYS.compare, list.filter((id) => id !== productId));
    return 'removed';
  }
  if (list.length >= COMPARE_LIMIT) return 'full';
  writeList(KEYS.compare, [...list, productId]);
  return 'added';
}

export function clearCompare() {
  writeList(KEYS.compare, []);
}

export function trackRecentlyViewed(productId: string) {
  const list = readList(KEYS.recent).filter((id) => id !== productId);
  writeList(KEYS.recent, [productId, ...list].slice(0, RECENT_LIMIT));
}

// ───── Hooks ─────
const EMPTY: string[] = [];
const localCache = new Map<string, { raw: string | null; value: string[] }>();

/** Stable snapshot per raw value (useSyncExternalStore requires referential stability). */
function cachedLocal(key: string): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    raw = null;
  }
  const hit = localCache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  const value = readList(key);
  localCache.set(key, { raw, value });
  return value;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export const useWishlist = () => useSyncExternalStore(subscribe, wishlistSnapshot, () => EMPTY);
export const useCompare = () => useSyncExternalStore(subscribe, () => cachedLocal(KEYS.compare), () => EMPTY);
export const useRecentlyViewed = () => useSyncExternalStore(subscribe, () => cachedLocal(KEYS.recent), () => EMPTY);

// ───── Cart badge ─────
export const CART_EVENT = 'hd:cart';
export function announceCartCount(count: number) {
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: count }));
}

'use client';

import { useSyncExternalStore } from 'react';

const EVENT = 'hd:cookie-change';
const ONE_YEAR = 60 * 60 * 24 * 365;

function read(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function writePreferenceCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('focus', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('focus', onChange);
  };
}

/**
 * Read a non-httpOnly cookie reactively. The server snapshot is `null`, so cacheable (ISR)
 * pages render the anonymous/default state first and personalise after hydration.
 */
export function useCookie(name: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(name),
    () => null,
  );
}

/** Notify cookie readers after a request that may have changed cookies (login/logout). */
export function notifyCookieChange(): void {
  window.dispatchEvent(new Event(EVENT));
}

'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Storefront presentation settings from the admin dashboard (`storefront.display`). When prices are
 * hidden the shop is a catalogue: no prices, cart or checkout, and products are ordered on WhatsApp.
 */
export interface StoreDisplay {
  showPrices: boolean;
  /** Digits only, ready for wa.me links; empty when no WhatsApp number is set. */
  whatsapp: string;
}

const StoreDisplayContext = createContext<StoreDisplay>({ showPrices: true, whatsapp: '' });

export function StoreDisplayProvider({ value, children }: { value: StoreDisplay; children: ReactNode }) {
  return <StoreDisplayContext.Provider value={value}>{children}</StoreDisplayContext.Provider>;
}

export function useStoreDisplay(): StoreDisplay {
  return useContext(StoreDisplayContext);
}

/** Renders its children only while prices are shown (price rows, discount badges, price filters). */
export function PriceGate({ children }: { children: ReactNode }) {
  return useStoreDisplay().showPrices ? <>{children}</> : null;
}

/** A wa.me link with a prefilled message, or null when no WhatsApp number is set. */
export function whatsappHref(number: string, text: string): string | null {
  const digits = number.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

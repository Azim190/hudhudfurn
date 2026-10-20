// Hudhud's real products, from the shop's own photos or supplier photos it is licensed to use. Photos live
// in apps/api/seed-assets/<imageDir>. Prices and stock are placeholders until the shop confirms them.
export interface ShowroomProduct {
  ar: string;
  en: string;
  descAr: string;
  descEn: string;
  /** Colour code → photos of that colourway (the first is linked to its variants). */
  colors: Record<string, string[]>;
  attrs?: Record<string, string[]>;
  /** Fixed-price products: price (SAR) per size code of the group's size axis. */
  sizes?: Record<string, number>;
  /** Made-to-measure products: configurator fabric price (SAR per metre). */
  fabricPrice?: number;
}

export interface ShowroomGroup {
  category: string;
  imageDir: string;
  sizeAxis?: string;
  madeToMeasure?: { template: string; fabricWidthMm: number };
  products: ShowroomProduct[];
}

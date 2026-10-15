/**
 * Bilingual completeness indicator for the admin product editor. Arabic content is required
 * to publish; English and merchandising extras raise the score.
 */
export interface CompletenessInput {
  nameAr?: string | null;
  nameEn?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  careAr?: string | null;
  careEn?: string | null;
  seoTitleAr?: string | null;
  seoTitleEn?: string | null;
  seoDescriptionAr?: string | null;
  seoDescriptionEn?: string | null;
  imageCount: number;
  imagesMissingAlt: number;
  activeVariantCount: number;
  hasPrice: boolean;
}

export type CompletenessCheck =
  | 'nameAr'
  | 'nameEn'
  | 'descriptionAr'
  | 'descriptionEn'
  | 'careAr'
  | 'careEn'
  | 'seoAr'
  | 'seoEn'
  | 'images'
  | 'imageAlt'
  | 'variants'
  | 'price';

/** Checks that must pass before a product can be published. */
export const PUBLISH_REQUIREMENTS: readonly CompletenessCheck[] = ['nameAr', 'descriptionAr', 'images', 'variants', 'price'];

const WEIGHTS: Record<CompletenessCheck, number> = {
  nameAr: 15,
  nameEn: 10,
  descriptionAr: 15,
  descriptionEn: 10,
  careAr: 5,
  careEn: 5,
  seoAr: 5,
  seoEn: 5,
  images: 10,
  imageAlt: 5,
  variants: 10,
  price: 5,
};

const filled = (s: string | null | undefined, min = 1) => (s?.trim().length ?? 0) >= min;

export interface CompletenessResult {
  score: number;
  /** Per-language progress for the side-by-side editor. */
  ar: number;
  en: number;
  missing: CompletenessCheck[];
  canPublish: boolean;
}

export function computeCompleteness(p: CompletenessInput): CompletenessResult {
  const passed: Record<CompletenessCheck, boolean> = {
    nameAr: filled(p.nameAr, 2),
    nameEn: filled(p.nameEn, 2),
    descriptionAr: filled(p.descriptionAr, 20),
    descriptionEn: filled(p.descriptionEn, 20),
    careAr: filled(p.careAr),
    careEn: filled(p.careEn),
    seoAr: filled(p.seoTitleAr) && filled(p.seoDescriptionAr),
    seoEn: filled(p.seoTitleEn) && filled(p.seoDescriptionEn),
    images: p.imageCount > 0,
    imageAlt: p.imageCount > 0 && p.imagesMissingAlt === 0,
    variants: p.activeVariantCount > 0,
    price: p.hasPrice,
  };
  const checks = Object.keys(WEIGHTS) as CompletenessCheck[];
  const score = checks.reduce((sum, c) => sum + (passed[c] ? WEIGHTS[c] : 0), 0);
  const lang = (suffix: 'Ar' | 'En') => {
    const keys = ['name', 'description', 'care', 'seo'].map((k) => `${k}${suffix}` as CompletenessCheck);
    const total = keys.reduce((s, k) => s + WEIGHTS[k], 0);
    return Math.round((keys.reduce((s, k) => s + (passed[k] ? WEIGHTS[k] : 0), 0) * 100) / total);
  };
  return {
    score,
    ar: lang('Ar'),
    en: lang('En'),
    missing: checks.filter((c) => !passed[c]),
    canPublish: PUBLISH_REQUIREMENTS.every((c) => passed[c]),
  };
}

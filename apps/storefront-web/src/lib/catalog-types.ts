/** Shapes returned by the public catalog API (prices are integer halalas). */
export interface Media {
  id: string;
  width: number | null;
  height: number | null;
  altAr: string | null;
  altEn: string | null;
  url: string;
  thumbnailUrl: string;
  renditions: Array<{ format: string; width: number; url: string }>;
}

export interface Swatch {
  attributeKey: string;
  code: string;
  labelAr: string;
  labelEn: string | null;
  swatchHex: string | null;
}

export interface ProductCard {
  id: string;
  slugAr: string;
  slugEn: string;
  nameAr: string;
  nameEn: string | null;
  vertical: string;
  pricingMode: 'FIXED' | 'PER_METER' | 'PER_SQM' | 'CALCULATED';
  isMadeToMeasure: boolean;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  priceFrom: boolean;
  inStock: boolean;
  ratingAvg: number;
  ratingCount: number;
  image: Media | null;
  swatches: Swatch[];
}

export interface CategoryNode {
  id: string;
  parentId: string | null;
  vertical: string;
  nameAr: string;
  nameEn: string | null;
  slugAr: string;
  slugEn: string;
  productCount: number;
  imageUrl: string | null;
  children: CategoryNode[];
}

export interface FacetDefinition {
  key: string;
  nameAr: string;
  nameEn: string | null;
  type: 'SELECT' | 'MULTISELECT' | 'BOOLEAN' | 'NUMBER' | 'COLOR';
  unit: string | null;
  values: Array<{ code: string; labelAr: string; labelEn: string | null; swatchHex: string | null }>;
}

export interface Crumb {
  id: string;
  nameAr: string;
  nameEn: string | null;
  slugAr: string;
  slugEn: string;
}

export interface CategoryPage {
  id: string;
  nameAr: string;
  nameEn: string | null;
  slugAr: string;
  slugEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  seoTitleAr: string | null;
  seoTitleEn: string | null;
  seoDescriptionAr: string | null;
  seoDescriptionEn: string | null;
  breadcrumb: Crumb[];
  children: Array<Crumb & { image: Media | null }>;
  facets: FacetDefinition[];
}

export interface Listing {
  items: ProductCard[];
  total: number;
  page: number;
  limit: number;
  facetCounts: Record<string, Record<string, number>>;
  priceRange: { min: number; max: number } | null;
  degraded: boolean;
}

export interface ProductDetail extends ProductCard {
  descriptionAr: string | null;
  descriptionEn: string | null;
  careAr: string | null;
  careEn: string | null;
  seo: { titleAr: string | null; titleEn: string | null; descriptionAr: string | null; descriptionEn: string | null };
  basePrice: number;
  vatInclusive: boolean;
  sampleAvailable: boolean;
  samplePrice: number | null;
  sizeGuide: {
    titleAr: string;
    titleEn: string | null;
    table: { columns: Array<{ ar: string; en?: string }>; rows: Array<Array<string | number>> };
    howToMeasureAr: string | null;
    howToMeasureEn: string | null;
  } | null;
  attributes: Array<{ key: string; nameAr: string; nameEn: string | null; type: string; values: Array<{ code: string; labelAr: string; labelEn: string | null }> }>;
  axes: Array<{ key: string; nameAr: string; nameEn: string | null; type: string; values: Swatch[] }>;
  variants: Array<{
    id: string;
    sku: string;
    price: number;
    compareAtPrice: number | null;
    discountPercent: number;
    options: Record<string, string>;
    available: boolean;
    lowStock: boolean;
    isDefault: boolean;
    imageIds: string[];
  }>;
  media: Array<Media & { variantId: string | null }>;
  breadcrumb: Crumb[];
  related: { completeTheLook: ProductCard[]; crossSell: ProductCard[]; similar: ProductCard[] };
}

export interface Banner {
  id: string;
  placement: 'HERO' | 'STRIP' | 'CATEGORY';
  titleAr: string;
  titleEn: string | null;
  subtitleAr: string | null;
  subtitleEn: string | null;
  ctaAr: string | null;
  ctaEn: string | null;
  link: string | null;
  imageAr: Media | null;
  imageEn: Media | null;
}

export interface HomeContent {
  hero: Banner[];
  strip: Banner[];
  categories: Array<Omit<CategoryNode, 'children'> & { children: Array<Omit<CategoryNode, 'children'>> }>;
  collections: Array<{
    id: string;
    type: string;
    nameAr: string;
    nameEn: string | null;
    slugAr: string;
    slugEn: string;
    descriptionAr: string | null;
    descriptionEn: string | null;
    products: ProductCard[];
  }>;
}

export const pick = (locale: string, ar: string | null | undefined, en: string | null | undefined): string =>
  locale === 'en' ? en || ar || '' : ar || en || '';

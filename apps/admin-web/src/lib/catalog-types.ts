/** Shapes returned by the admin catalog API (subset used by the dashboard). */
export interface MediaDto {
  id: string;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  width: number | null;
  height: number | null;
  altAr: string | null;
  altEn: string | null;
  url: string;
  thumbnailUrl: string;
  renditions: Array<{ format: string; width: number; url: string }>;
}

export interface AttributeValue {
  id: string;
  code: string;
  labelAr: string;
  labelEn: string | null;
  swatchHex: string | null;
  sortOrder: number;
}

export interface Attribute {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string | null;
  type: 'SELECT' | 'MULTISELECT' | 'BOOLEAN' | 'NUMBER' | 'COLOR';
  unit: string | null;
  values: AttributeValue[];
  _count?: { categories: number };
}

export interface CategoryNode {
  id: string;
  parentId: string | null;
  vertical: 'CURTAINS' | 'BEDDING' | 'SOFA_COVERS' | 'ABAYAS' | 'ACCESSORIES';
  nameAr: string;
  nameEn: string | null;
  slugAr: string;
  slugEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  children: CategoryNode[];
}

export interface ProductListItem {
  id: string;
  nameAr: string;
  nameEn: string | null;
  skuPrefix: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  price: number;
  priceFrom: boolean;
  image: MediaDto | null;
  category: { nameAr: string; nameEn: string | null };
  variantCount: number;
  totalStock: number;
  completeness: number;
  isMadeToMeasure: boolean;
  updatedAt: string;
}

export interface CategoryAttributeConfig {
  attributeId: string;
  key: string;
  nameAr: string;
  nameEn: string | null;
  type: Attribute['type'];
  isFacet: boolean;
  isVariantAxis: boolean;
  isRequired: boolean;
  values: AttributeValue[];
}

export interface AdminVariant {
  id: string;
  sku: string;
  price: number | null;
  compareAtPrice: number | null;
  optionKey: string;
  isActive: boolean;
  isDefault: boolean;
  available: number;
  options: Array<{ attributeKey: string; valueId: string; code: string; labelAr: string; labelEn: string | null }>;
  stock: Array<{ locationId: string; onHand: number; reserved: number; location: { id: string; code: string; nameAr: string; nameEn: string | null } }>;
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

export interface AdminProduct {
  id: string;
  categoryId: string;
  skuPrefix: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  nameAr: string;
  nameEn: string | null;
  slugAr: string;
  slugEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  careAr: string | null;
  careEn: string | null;
  seoTitleAr: string | null;
  seoTitleEn: string | null;
  seoDescriptionAr: string | null;
  seoDescriptionEn: string | null;
  pricingMode: 'FIXED' | 'PER_METER' | 'PER_SQM' | 'CALCULATED';
  basePrice: number;
  compareAtPrice: number | null;
  vatInclusive: boolean;
  isMadeToMeasure: boolean;
  sampleAvailable: boolean;
  samplePrice: number | null;
  photoStyle: 'ON_MODEL' | 'MANNEQUIN' | 'FLAT_LAY' | 'LIFESTYLE' | null;
  sizeGuideId: string | null;
  configuratorTemplateId: string | null;
  attributeValueIds: string[];
  media: Array<MediaDto & { variantId: string | null; sortOrder: number }>;
  variants: AdminVariant[];
  categoryAttributes: CategoryAttributeConfig[];
  completeness: { score: number; ar: number; en: number; missing: CompletenessCheck[]; canPublish: boolean };
}

export interface Location {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  isActive: boolean;
}

/** Depth-first flattening for <select> options, with indentation depth. */
export function flattenCategories(nodes: CategoryNode[], depth = 0): Array<CategoryNode & { depth: number }> {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flattenCategories(n.children, depth + 1)]);
}

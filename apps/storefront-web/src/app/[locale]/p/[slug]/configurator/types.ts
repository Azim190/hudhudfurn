export type Kind = 'CURTAIN' | 'BLIND' | 'ABAYA' | 'SOFA_COVER';

export interface TemplateOption {
  group: string;
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  priceBasis: 'FLAT' | 'PER_METER' | 'PER_SQM' | 'PER_PANEL' | 'PER_WIDTH_M' | 'PER_PIECE';
  price: number;
  isDefault: boolean;
}

export interface ConfiguratorData {
  template: {
    id: string;
    code: string;
    kind: Kind;
    nameAr: string;
    nameEn: string;
    version: number;
    constants: Record<string, number>;
    headingStyles: Array<{ code: string; nameAr: string; nameEn: string; fullnessMin: number; fullnessMax: number; fullnessDefault: number; makingCostPerM: number }>;
    options: TemplateOption[];
  };
  variants: Array<{ id: string; price: number; fabricWidthMm: number | null; options: Array<{ attributeKey: string; code: string; labelAr: string; labelEn: string | null; swatchHex: string | null }> }>;
}

export interface Piece {
  code: string;
  quantity: number;
  widthMm?: number;
  depthMm?: number;
  heightMm?: number;
}

export interface Inputs {
  widthMm?: number;
  heightMm?: number;
  panels?: number;
  headingStyle?: string;
  fullness?: number;
  choices?: Record<string, string>;
  extras?: string[];
  measurements?: Record<string, number>;
  pieces?: Piece[];
  photoIds?: string[];
  notes?: string;
}

export interface Quote {
  valid: boolean;
  issues: Array<{ field: string; code: string; params?: Record<string, number | string> }>;
  lines: Array<{ key: string; group: string; nameAr: string; nameEn: string; quantity: number; unit: 'm' | 'm2' | 'panel' | 'piece' | 'item'; unitPrice: number; amount: number }>;
  total: number;
  specs: Record<string, number | string>;
  choices: Array<{ group: string; code: string; nameAr: string; nameEn: string }>;
}

export const SINGLE_GROUPS = ['MOUNTING', 'LINING', 'TRACK', 'MOTOR', 'CONTROL', 'FABRIC', 'INSTALLATION'] as const;
export const MULTI_GROUPS = ['ACCESSORY', 'EXTRA'] as const;

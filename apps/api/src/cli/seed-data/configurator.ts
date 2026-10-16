import type { PrismaClient } from '@prisma/client';

/**
 * Sample configurator templates (assumptions 6–7, 51–56) and the products they price. Prices are
 * VAT-inclusive halalas. Templates are created once; admins edit them afterwards.
 */
type Option = { group: string; code: string; ar: string; en: string; basis: 'FLAT' | 'PER_METER' | 'PER_SQM' | 'PER_PANEL' | 'PER_WIDTH_M' | 'PER_PIECE'; price: number; isDefault?: boolean; descAr?: string; descEn?: string };

interface SeedTemplate {
  code: string;
  kind: 'CURTAIN' | 'BLIND' | 'ABAYA' | 'SOFA_COVER';
  ar: string;
  en: string;
  constants?: Record<string, number>;
  headings?: Array<{ code: string; ar: string; en: string; min: number; max: number; def: number; making: number }>;
  options: Option[];
}

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    code: 'CUSTOM_CURTAINS',
    kind: 'CURTAIN',
    ar: 'ستائر تفصيل',
    en: 'Made-to-measure curtains',
    headings: [
      { code: 'WAVE', ar: 'ويف', en: 'Wave', min: 200, max: 250, def: 220, making: 3500 },
      { code: 'PINCH_PLEAT', ar: 'كسرات', en: 'Pinch pleat', min: 220, max: 280, def: 250, making: 4500 },
      { code: 'EYELET', ar: 'حلقات', en: 'Eyelet', min: 180, max: 200, def: 190, making: 2500 },
      { code: 'ROD_POCKET', ar: 'جيب للعصا', en: 'Rod pocket', min: 180, max: 220, def: 200, making: 2000 },
    ],
    options: [
      { group: 'MOUNTING', code: 'WALL', ar: 'تركيب على الجدار', en: 'Wall mounted', basis: 'FLAT', price: 0, isDefault: true },
      { group: 'MOUNTING', code: 'CEILING', ar: 'تركيب في السقف', en: 'Ceiling mounted', basis: 'FLAT', price: 0 },
      { group: 'MOUNTING', code: 'RECESS', ar: 'داخل فتحة النافذة', en: 'Inside the recess', basis: 'FLAT', price: 0 },
      { group: 'LINING', code: 'NONE', ar: 'بدون بطانة', en: 'No lining', basis: 'FLAT', price: 0, isDefault: true },
      { group: 'LINING', code: 'STANDARD', ar: 'بطانة عادية', en: 'Standard lining', basis: 'PER_METER', price: 2500 },
      { group: 'LINING', code: 'BLACKOUT', ar: 'بطانة معتمة (بلاك أوت)', en: 'Blackout lining', basis: 'PER_METER', price: 3900 },
      { group: 'LINING', code: 'THERMAL', ar: 'بطانة عازلة للحرارة', en: 'Thermal lining', basis: 'PER_METER', price: 4900 },
      { group: 'TRACK', code: 'NONE', ar: 'لدي مسار/عصا', en: 'I have a track or rod', basis: 'FLAT', price: 0, isDefault: true },
      { group: 'TRACK', code: 'STANDARD_TRACK', ar: 'مسار ألمنيوم', en: 'Aluminium track', basis: 'PER_WIDTH_M', price: 6500 },
      { group: 'TRACK', code: 'WAVE_TRACK', ar: 'مسار ويف', en: 'Wave track', basis: 'PER_WIDTH_M', price: 9500 },
      { group: 'TRACK', code: 'ROD', ar: 'عصا معدنية', en: 'Metal rod', basis: 'PER_WIDTH_M', price: 7500 },
      { group: 'MOTOR', code: 'MANUAL', ar: 'يدوي', en: 'Manual', basis: 'FLAT', price: 0, isDefault: true },
      { group: 'MOTOR', code: 'ELECTRIC', ar: 'كهربائي مع ريموت', en: 'Electric with remote', basis: 'FLAT', price: 89000 },
      { group: 'MOTOR', code: 'SMART', ar: 'ذكي (تطبيق وأوامر صوتية)', en: 'Smart (app and voice control)', basis: 'FLAT', price: 129000 },
      { group: 'ACCESSORY', code: 'TIEBACKS', ar: 'مماسك جانبية', en: 'Tie-backs', basis: 'PER_PANEL', price: 3900 },
      { group: 'ACCESSORY', code: 'WEIGHTS', ar: 'أثقال للحافة السفلية', en: 'Hem weights', basis: 'PER_PANEL', price: 1500 },
      { group: 'INSTALLATION', code: 'NONE', ar: 'بدون تركيب', en: 'No installation', basis: 'FLAT', price: 0, isDefault: true },
      { group: 'INSTALLATION', code: 'STANDARD', ar: 'تركيب من فنيينا', en: 'Installation by our technicians', basis: 'FLAT', price: 15000 },
    ],
  },
  {
    code: 'CUSTOM_BLINDS',
    kind: 'BLIND',
    ar: 'ستائر رول وروماني تفصيل',
    en: 'Made-to-measure blinds',
    options: [
      { group: 'MOUNTING', code: 'INSIDE', ar: 'داخل فتحة النافذة', en: 'Inside the recess', basis: 'FLAT', price: 0, isDefault: true },
      { group: 'MOUNTING', code: 'OUTSIDE', ar: 'خارج فتحة النافذة', en: 'Outside the recess', basis: 'FLAT', price: 0 },
      { group: 'CONTROL', code: 'CHAIN_RIGHT', ar: 'سلسلة يمين', en: 'Chain on the right', basis: 'FLAT', price: 0, isDefault: true },
      { group: 'CONTROL', code: 'CHAIN_LEFT', ar: 'سلسلة يسار', en: 'Chain on the left', basis: 'FLAT', price: 0 },
      { group: 'MOTOR', code: 'MANUAL', ar: 'يدوي', en: 'Manual', basis: 'FLAT', price: 0, isDefault: true },
      { group: 'MOTOR', code: 'ELECTRIC', ar: 'كهربائي مع ريموت', en: 'Electric with remote', basis: 'FLAT', price: 65000 },
      { group: 'MOTOR', code: 'SMART', ar: 'ذكي (تطبيق وأوامر صوتية)', en: 'Smart (app and voice control)', basis: 'FLAT', price: 95000 },
      { group: 'INSTALLATION', code: 'NONE', ar: 'بدون تركيب', en: 'No installation', basis: 'FLAT', price: 0, isDefault: true },
      { group: 'INSTALLATION', code: 'STANDARD', ar: 'تركيب من فنيينا', en: 'Installation by our technicians', basis: 'FLAT', price: 10000 },
    ],
  },
  {
    code: 'CUSTOM_ABAYA',
    kind: 'ABAYA',
    ar: 'تفصيل عباية بالمقاس',
    en: 'Custom-tailored abaya',
    options: [
      { group: 'TAILORING', code: 'CUSTOM', ar: 'تفصيل حسب مقاساتك', en: 'Tailored to your measurements', basis: 'FLAT', price: 5000, isDefault: true },
      { group: 'EXTRA', code: 'MATCHING_TARHA', ar: 'طرحة مطابقة', en: 'Matching tarha', basis: 'FLAT', price: 4900 },
      { group: 'EXTRA', code: 'SLEEVE_EMBROIDERY', ar: 'تطريز على الأكمام', en: 'Sleeve embroidery', basis: 'FLAT', price: 7900 },
    ],
  },
  {
    code: 'CUSTOM_SOFA_COVERS',
    kind: 'SOFA_COVER',
    ar: 'أغطية كنب تفصيل',
    en: 'Tailored sofa covers',
    options: [
      { group: 'PIECE', code: 'SEAT_1', ar: 'كنبة مقعد واحد', en: 'One-seater', basis: 'PER_PIECE', price: 25000 },
      { group: 'PIECE', code: 'SEAT_2', ar: 'كنبة مقعدين', en: 'Two-seater', basis: 'PER_PIECE', price: 35000 },
      { group: 'PIECE', code: 'SEAT_3', ar: 'كنبة ثلاثة مقاعد', en: 'Three-seater', basis: 'PER_PIECE', price: 45000 },
      { group: 'PIECE', code: 'CORNER', ar: 'قطعة زاوية', en: 'Corner piece', basis: 'PER_PIECE', price: 30000 },
      { group: 'PIECE', code: 'CHAISE', ar: 'شيزلونج', en: 'Chaise', basis: 'PER_PIECE', price: 35000 },
      { group: 'PIECE', code: 'CUSHION', ar: 'كوشن ظهر', en: 'Back cushion', basis: 'PER_PIECE', price: 6000 },
      { group: 'FABRIC', code: 'STANDARD', ar: 'قماش الموديل', en: 'Selected fabric', basis: 'FLAT', price: 0, isDefault: true },
      { group: 'FABRIC', code: 'WATER_RESISTANT', ar: 'معالجة مقاومة للماء', en: 'Water-resistant finish', basis: 'PER_METER', price: 2500 },
      { group: 'EXTRA', code: 'PIPING', ar: 'حواف بيبنج', en: 'Contrast piping', basis: 'FLAT', price: 4900 },
    ],
  },
  {
    code: 'CUSTOM_MAJLIS',
    kind: 'SOFA_COVER',
    ar: 'أغطية جلسة أرضية تفصيل',
    en: 'Tailored majlis covers',
    constants: { maxPieces: 40 },
    options: [
      { group: 'PIECE', code: 'FLOOR_CUSHION', ar: 'مرتبة أرضية', en: 'Floor cushion', basis: 'PER_PIECE', price: 18000 },
      { group: 'PIECE', code: 'BACKREST', ar: 'مسند ظهر', en: 'Backrest', basis: 'PER_PIECE', price: 9000 },
      { group: 'PIECE', code: 'ARMREST', ar: 'مركى', en: 'Armrest', basis: 'PER_PIECE', price: 4500 },
      { group: 'PIECE', code: 'CORNER', ar: 'قطعة زاوية', en: 'Corner piece', basis: 'PER_PIECE', price: 12000 },
      { group: 'FABRIC', code: 'STANDARD', ar: 'قماش الموديل', en: 'Selected fabric', basis: 'FLAT', price: 0, isDefault: true },
      { group: 'FABRIC', code: 'JACQUARD', ar: 'جاكار فاخر', en: 'Premium jacquard', basis: 'PER_METER', price: 2500 },
      { group: 'EXTRA', code: 'GOLD_TRIM', ar: 'حواف ذهبية', en: 'Gold trim', basis: 'FLAT', price: 14900 },
    ],
  },
];

/** Products priced by a template: pricing mode, base price (per m of fabric, per m², per garment, "from"), fabric width. */
export const CONFIGURED_PRODUCTS: Array<{ slugEn: string; template: string; pricingMode?: 'CALCULATED'; basePrice?: number; fabricWidthMm?: number }> = [
  { slugEn: 'made-to-measure-wave-blackout-curtain', template: 'CUSTOM_CURTAINS', pricingMode: 'CALCULATED', basePrice: 8900, fabricWidthMm: 2800 },
  { slugEn: 'made-to-measure-natural-linen-curtain', template: 'CUSTOM_CURTAINS', pricingMode: 'CALCULATED', basePrice: 11900, fabricWidthMm: 1400 },
  { slugEn: 'linen-roman-blind', template: 'CUSTOM_BLINDS', pricingMode: 'CALCULATED' },
  { slugEn: 'made-to-measure-tailored-sofa-cover', template: 'CUSTOM_SOFA_COVERS' },
  { slugEn: 'tailored-majlis-floor-seating-cover', template: 'CUSTOM_MAJLIS' },
  { slugEn: 'classic-closed-crepe-abaya', template: 'CUSTOM_ABAYA' },
  { slugEn: 'embroidered-georgette-butterfly-abaya', template: 'CUSTOM_ABAYA' },
  { slugEn: 'gold-trim-bisht-abaya', template: 'CUSTOM_ABAYA' },
];

export async function seedConfigurators(prisma: PrismaClient, log: (msg: string) => void) {
  for (const t of SEED_TEMPLATES) {
    if (await prisma.configuratorTemplate.findUnique({ where: { code: t.code } })) continue;
    await prisma.configuratorTemplate.create({
      data: {
        code: t.code,
        kind: t.kind,
        nameAr: t.ar,
        nameEn: t.en,
        constants: t.constants ?? {},
        formulas: {},
        headingStyles: { create: (t.headings ?? []).map((h, i) => ({ code: h.code, nameAr: h.ar, nameEn: h.en, fullnessMin: h.min, fullnessMax: h.max, fullnessDefault: h.def, makingCostPerM: h.making, sortOrder: i })) },
        options: { create: t.options.map((o, i) => ({ group: o.group, code: o.code, nameAr: o.ar, nameEn: o.en, descriptionAr: o.descAr, descriptionEn: o.descEn, priceBasis: o.basis, price: o.price, isDefault: o.isDefault ?? false, sortOrder: i })) },
      },
    });
  }
  let linked = 0;
  for (const p of CONFIGURED_PRODUCTS) {
    const [template, product] = await Promise.all([prisma.configuratorTemplate.findUnique({ where: { code: p.template } }), prisma.product.findUnique({ where: { slugEn: p.slugEn } })]);
    if (!template || !product || product.configuratorTemplateId) continue;
    await prisma.product.update({
      where: { id: product.id },
      data: { configuratorTemplateId: template.id, pricingMode: p.pricingMode ?? product.pricingMode, basePrice: p.basePrice ?? product.basePrice, isMadeToMeasure: p.pricingMode ? true : product.isMadeToMeasure },
    });
    if (p.fabricWidthMm) await prisma.productVariant.updateMany({ where: { productId: product.id }, data: { fabricWidthMm: p.fabricWidthMm } });
    linked++;
  }
  log(`✓ ${SEED_TEMPLATES.length} configurator templates, ${linked} products linked`);
}

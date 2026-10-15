import type { Vertical } from '@prisma/client';

export interface SeedCategory {
  key: string;
  parent?: string;
  vertical: Vertical;
  ar: string;
  en: string;
  descAr: string;
  descEn: string;
  /** Attribute configuration; children inherit and can add their own. */
  attributes?: Array<{ key: string; facet?: boolean; axis?: boolean; required?: boolean }>;
  sizeGuide?: string;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    key: 'curtains',
    vertical: 'CURTAINS',
    ar: 'الستائر والبلايند',
    en: 'Curtains & Blinds',
    descAr: 'ستائر جاهزة وتفصيل حسب المقاس وبلايند بجميع أنواعه، مع خدمة القياس والتركيب في منزلك.',
    descEn: 'Ready-made and made-to-measure curtains and blinds of every kind, with in-home measuring and installation.',
    sizeGuide: 'curtain_measuring',
    attributes: [
      { key: 'color', axis: true },
      { key: 'curtain_type' },
      { key: 'curtain_fabric' },
      { key: 'opacity' },
      { key: 'pattern' },
      { key: 'heading_style' },
      { key: 'lining', facet: false },
      { key: 'mounting', facet: false },
      { key: 'motorization' },
      { key: 'fire_retardant' },
      { key: 'washable' },
    ],
  },
  {
    key: 'ready-curtains',
    parent: 'curtains',
    vertical: 'CURTAINS',
    ar: 'ستائر جاهزة',
    en: 'Ready-made curtains',
    descAr: 'ستائر بمقاسات قياسية جاهزة للتعليق فوراً.',
    descEn: 'Standard-size curtains, ready to hang straight away.',
    attributes: [{ key: 'curtain_size', axis: true }],
  },
  {
    key: 'custom-curtains',
    parent: 'curtains',
    vertical: 'CURTAINS',
    ar: 'ستائر تفصيل',
    en: 'Made-to-measure curtains',
    descAr: 'ستائر تُفصّل على مقاس نافذتك بدقة، مع اختيار نوع التعليق والبطانة والتشغيل.',
    descEn: 'Curtains tailored precisely to your window, with your choice of heading, lining and operation.',
  },
  {
    key: 'blinds',
    parent: 'curtains',
    vertical: 'CURTAINS',
    ar: 'بلايند',
    en: 'Blinds',
    descAr: 'رول وروماني وزيبرا وخشبي، يُصنع حسب المقاس ويُسعّر بالمتر المربع.',
    descEn: 'Roller, Roman, zebra and wooden blinds, made to measure and priced per square metre.',
  },
  {
    key: 'curtain-accessories',
    parent: 'curtains',
    vertical: 'ACCESSORIES',
    ar: 'اكسسوارات الستائر',
    en: 'Curtain accessories',
    descAr: 'سكك ومواسير ومعلّقات وماسكات ستائر.',
    descEn: 'Tracks, rods, brackets and tie-backs.',
    attributes: [{ key: 'accessory_size', axis: true }],
  },
  {
    key: 'bedding',
    vertical: 'BEDDING',
    ar: 'المفارش والملايات',
    en: 'Bedding & Sheets',
    descAr: 'أطقم ملايات ومفارش وأغطية لحاف من القطن المصري والساتان والبامبو.',
    descEn: 'Sheet sets, comforters and duvet covers in Egyptian cotton, satin and bamboo.',
    sizeGuide: 'bed_sizes',
    attributes: [
      { key: 'color', axis: true },
      { key: 'bed_size', axis: true },
      { key: 'bedding_material' },
      { key: 'thread_count' },
      { key: 'set_type' },
    ],
  },
  { key: 'sheet-sets', parent: 'bedding', vertical: 'BEDDING', ar: 'أطقم ملايات', en: 'Sheet sets', descAr: 'شرشف مطاطي وشرشف علوي وأكياس مخدات بخامات تتنفس.', descEn: 'Fitted sheet, flat sheet and pillowcases in breathable fabrics.' },
  { key: 'comforter-sets', parent: 'bedding', vertical: 'BEDDING', ar: 'أطقم مفارش', en: 'Comforter sets', descAr: 'مفارش متكاملة بحشوة ناعمة لغرفة نوم أنيقة.', descEn: 'Complete comforter sets with soft filling for an elegant bedroom.' },
  { key: 'duvet-covers', parent: 'bedding', vertical: 'BEDDING', ar: 'أغطية لحاف', en: 'Duvet covers', descAr: 'أغطية لحاف قابلة للغسيل بإغلاق سحاب مخفي.', descEn: 'Washable duvet covers with a concealed zip.' },
  {
    key: 'sofa-covers',
    vertical: 'SOFA_COVERS',
    ar: 'أغطية أطقم الجلوس',
    en: 'Sofa & Majlis Covers',
    descAr: 'أغطية كنب مطاطية وتفصيل، وأغطية جلسات أرضية ومساند ومخدات.',
    descEn: 'Stretch and tailored sofa covers, majlis floor-seating covers, back cushions and armrests.',
    attributes: [
      { key: 'color', axis: true },
      { key: 'seat_config', axis: true },
      { key: 'cover_type' },
      { key: 'water_resistant' },
      { key: 'pet_friendly' },
    ],
  },
  { key: 'stretch-covers', parent: 'sofa-covers', vertical: 'SOFA_COVERS', ar: 'أغطية كنب مطاطية', en: 'Stretch sofa covers', descAr: 'تلبس بسهولة وتناسب معظم الكنب.', descEn: 'Easy to fit and suits most sofas.' },
  { key: 'majlis-covers', parent: 'sofa-covers', vertical: 'SOFA_COVERS', ar: 'أغطية الجلسات الأرضية', en: 'Majlis covers', descAr: 'أغطية للجلسات العربية الأرضية مع المساند والمراكي.', descEn: 'Covers for Arabic floor seating, back cushions and armrests.' },
  { key: 'cushion-covers', parent: 'sofa-covers', vertical: 'SOFA_COVERS', ar: 'أكياس مخدات', en: 'Cushion covers', descAr: 'أكياس مخدات منسقة مع الستائر والكنب.', descEn: 'Cushion covers coordinated with curtains and sofas.' },
  {
    key: 'abayas',
    vertical: 'ABAYAS',
    ar: 'العبايات',
    en: 'Abayas',
    descAr: 'عبايات يومية وعملية ومناسبات من الكريب والندى والجورجيت، بأطوال من 50 إلى 62 إنش.',
    descEn: 'Everyday, work and occasion abayas in crepe, nida and georgette, in lengths from 50" to 62".',
    sizeGuide: 'abaya_sizes',
    attributes: [
      { key: 'color', axis: true },
      { key: 'abaya_length', axis: true },
      { key: 'size', axis: true },
      { key: 'abaya_style' },
      { key: 'abaya_fabric' },
      { key: 'embellishment' },
      { key: 'sleeve_style' },
      { key: 'occasion' },
    ],
  },
  { key: 'daily-abayas', parent: 'abayas', vertical: 'ABAYAS', ar: 'عبايات يومية', en: 'Everyday abayas', descAr: 'خفيفة وعملية للاستخدام اليومي.', descEn: 'Light and practical for every day.' },
  { key: 'occasion-abayas', parent: 'abayas', vertical: 'ABAYAS', ar: 'عبايات مناسبات', en: 'Occasion abayas', descAr: 'تطريز وخرز وتفاصيل فاخرة للمناسبات.', descEn: 'Embroidery, beading and luxurious detail for special occasions.' },
  { key: 'tarhas', parent: 'abayas', vertical: 'ABAYAS', ar: 'طرح وشيلات', en: 'Tarhas & shaylas', descAr: 'طرح وشيلات منسقة مع العبايات.', descEn: 'Tarhas and shaylas to match your abaya.' },
];

export const SEED_SIZE_GUIDES = [
  {
    key: 'abaya_sizes',
    titleAr: 'دليل مقاسات العبايات',
    titleEn: 'Abaya size guide',
    columns: [
      { ar: 'المقاس', en: 'Size' },
      { ar: 'الصدر (سم)', en: 'Chest (cm)' },
      { ar: 'الكتف (سم)', en: 'Shoulder (cm)' },
      { ar: 'الطول المقترح', en: 'Suggested length' },
    ],
    rows: [
      ['S', '86–92', '38', '52–54"'],
      ['M', '92–98', '40', '54–56"'],
      ['L', '98–106', '42', '56–58"'],
      ['XL', '106–114', '44', '58–60"'],
      ['XXL', '114–124', '46', '60–62"'],
    ],
    howToMeasureAr: 'قيسي الطول من أعلى الكتف حتى الكعب وأنتِ حافية القدمين، ثم أضيفي 2 إنش إذا كنتِ ترتدين الكعب العالي.',
    howToMeasureEn: 'Measure from the top of the shoulder to the heel while barefoot, then add 2" if you usually wear heels.',
  },
  {
    key: 'bed_sizes',
    titleAr: 'مقاسات الأسرّة',
    titleEn: 'Bed sizes',
    columns: [
      { ar: 'المقاس', en: 'Size' },
      { ar: 'المرتبة (سم)', en: 'Mattress (cm)' },
      { ar: 'الشرشف المطاطي', en: 'Fitted sheet' },
      { ar: 'عمق المرتبة', en: 'Mattress depth' },
    ],
    rows: [
      ['Single', '120 × 200', '120 × 200 + 35', 'حتى 35 سم / up to 35 cm'],
      ['Double', '140 × 200', '140 × 200 + 35', 'حتى 35 سم / up to 35 cm'],
      ['Queen', '160 × 200', '160 × 200 + 35', 'حتى 35 سم / up to 35 cm'],
      ['King', '180 × 200', '180 × 200 + 40', 'حتى 40 سم / up to 40 cm'],
      ['Super king', '200 × 200', '200 × 200 + 40', 'حتى 40 سم / up to 40 cm'],
    ],
    howToMeasureAr: 'قيسي عرض وطول المرتبة وعمقها، واختاري المقاس المطابق للمرتبة وليس لإطار السرير.',
    howToMeasureEn: 'Measure the width, length and depth of your mattress, and choose the size of the mattress, not the bed frame.',
  },
  {
    key: 'curtain_measuring',
    titleAr: 'كيف أقيس النافذة؟',
    titleEn: 'How to measure your window',
    columns: [
      { ar: 'التركيب', en: 'Mounting' },
      { ar: 'العرض', en: 'Width' },
      { ar: 'الارتفاع', en: 'Height' },
    ],
    rows: [
      ['على الجدار / Wall', 'عرض النافذة + 15–20 سم من كل جانب / window width + 15–20 cm each side', 'من السكة حتى الأرض ناقص 1 سم / track to floor minus 1 cm'],
      ['في السقف / Ceiling', 'عرض الجدار المطلوب تغطيته / wall width to cover', 'من السقف حتى الأرض ناقص 1 سم / ceiling to floor minus 1 cm'],
      ['داخل الفتحة / Recess', 'عرض الفتحة الداخلي ناقص 1 سم / inside width minus 1 cm', 'ارتفاع الفتحة الداخلي / inside height'],
    ],
    howToMeasureAr: 'استخدمي شريط قياس معدني، وقيسي في ثلاثة مواضع واعتمدي أصغر قراءة. غير متأكدة؟ احجزي زيارة قياس مجانية.',
    howToMeasureEn: 'Use a steel tape, measure in three places and use the smallest reading. Not sure? Book a free measurement visit.',
  },
];

import { describe, expect, it } from 'vitest';
import { computeCompleteness, type CompletenessInput } from './completeness';
import { discountPercent, priceLine, PricingError } from './pricing';
import { nameKey, slugify, uniqueSlug } from './slug';
import {
  combinationKey,
  diffVariantMatrix,
  generateVariantMatrix,
  MAX_VARIANTS_PER_PRODUCT,
  sanitizeSkuPart,
  VariantMatrixError,
} from './variant-matrix';

describe('slugify', () => {
  it('keeps Arabic letters, drops diacritics and punctuation', () => {
    expect(slugify('سِتَارَة بلاك آوت – رمادي!', 'ar')).toBe('ستارة-بلاك-آوت-رمادي');
    expect(slugify('عبـــاية  فراشة', 'ar')).toBe('عباية-فراشة');
  });

  it('converts Arabic-Indic digits and ampersands', () => {
    expect(slugify('طقم ٣+٢+١', 'ar')).toBe('طقم-3-2-1');
    expect(slugify('ستائر & بلايند', 'ar')).toBe('ستائر-و-بلايند');
    expect(slugify('Curtains & Blinds', 'en')).toBe('curtains-and-blinds');
  });

  it('produces lowercase ASCII for English, stripping accents and non-Latin text', () => {
    expect(slugify('  Crêpe Abaya — Black (54") ', 'en')).toBe('crepe-abaya-black-54');
    expect(slugify('عباية', 'en')).toBe('');
  });

  it('limits length without a trailing dash', () => {
    const s = slugify(`${'a'.repeat(119)} b`, 'en');
    expect(s.length).toBeLessThanOrEqual(120);
    expect(s.endsWith('-')).toBe(false);
  });

  it('uniqueSlug appends a counter', () => {
    const taken = new Set(['x', 'x-2']);
    expect(uniqueSlug('x', (s) => taken.has(s))).toBe('x-3');
    expect(uniqueSlug('y', (s) => taken.has(s))).toBe('y');
    expect(uniqueSlug('', () => false)).toBe('item');
    expect(() => uniqueSlug('z', () => true)).toThrow(/free slug/);
  });

  it('nameKey treats Arabic spelling variants as equal', () => {
    expect(nameKey('عباءة فراشة')).toBe(nameKey('عباءه  فراشه!'));
  });
});

describe('generateVariantMatrix', () => {
  const sizes = { attributeKey: 'size', values: [{ code: 'M' }, { code: 'L' }] };
  const colors = { attributeKey: 'color', values: [{ code: 'black' }, { code: 'navy blue' }] };

  it('builds the cartesian product with deterministic SKUs', () => {
    const combos = generateVariantMatrix([sizes, colors], 'aby-001');
    expect(combos.map((c) => c.sku)).toEqual([
      'ABY-001-M-BLACK',
      'ABY-001-M-NAVY-BLUE',
      'ABY-001-L-BLACK',
      'ABY-001-L-NAVY-BLUE',
    ]);
    expect(combos[0]!.key).toBe('color=black|size=M');
  });

  it('returns a single default variant without axes', () => {
    expect(generateVariantMatrix([], 'cur 9')).toEqual([{ options: [], sku: 'CUR-9', key: '' }]);
  });

  it('de-duplicates SKUs whose codes sanitize identically', () => {
    const combos = generateVariantMatrix([{ attributeKey: 'size', values: [{ code: 'x l' }, { code: 'x-l' }] }], 'P');
    expect(combos.map((c) => c.sku)).toEqual(['P-X-L', 'P-X-L-2']);
  });

  it('validates axes', () => {
    expect(() => generateVariantMatrix([sizes, sizes], 'P')).toThrow(VariantMatrixError);
    expect(() => generateVariantMatrix([{ attributeKey: 'size', values: [] }], 'P')).toThrow(/no values/);
    expect(() => generateVariantMatrix([{ attributeKey: 'size', values: [{ code: 'M' }, { code: 'M' }] }], 'P')).toThrow(/duplicate/);
    expect(() => generateVariantMatrix([sizes], '---')).toThrow(/prefix/);
    const many = { attributeKey: 'n', values: Array.from({ length: 30 }, (_, i) => ({ code: String(i) })) };
    expect(() => generateVariantMatrix([many, { ...many, attributeKey: 'm' }], 'P')).toThrow(String(MAX_VARIANTS_PER_PRODUCT));
  });

  it('diffs against existing variants without deleting history', () => {
    const generated = generateVariantMatrix([sizes], 'P');
    const diff = diffVariantMatrix(['size=M', 'size=XL'], generated);
    expect(diff.toCreate.map((c) => c.key)).toEqual(['size=L']);
    expect(diff.toDeactivate).toEqual(['size=XL']);
    expect(diff.unchanged).toEqual(['size=M']);
  });

  it('helpers are stable', () => {
    expect(sanitizeSkuPart('Crêpe / 54"')).toBe('CREPE-54');
    expect(combinationKey([{ attributeKey: 'b', code: '1' }, { attributeKey: 'a', code: '2' }])).toBe('a=2|b=1');
  });
});

describe('priceLine', () => {
  it('prices fixed items', () => {
    expect(priceLine({ mode: 'FIXED', unitPrice: 29900, quantity: 2 })).toEqual({ unitPrice: 29900, quantity: 2, total: 59800 });
  });

  it('prices fabric by length rounded up to the cutting step and minimum', () => {
    const r = priceLine({ mode: 'PER_METER', pricePerMeter: 4500, lengthCm: 233, quantity: 1 });
    expect(r).toEqual({ unitPrice: 10800, quantity: 1, total: 10800, billedMeasure: 240 });
    const min = priceLine({ mode: 'PER_METER', pricePerMeter: 4500, lengthCm: 20, quantity: 3, rules: { minLengthCm: 100, meterStepCm: 50 } });
    expect(min).toMatchObject({ unitPrice: 4500, total: 13500, billedMeasure: 100 });
  });

  it('prices blinds by area with a minimum billable area', () => {
    expect(priceLine({ mode: 'PER_SQM', pricePerSqm: 18000, widthMm: 1200, heightMm: 1500, quantity: 1 })).toEqual({
      unitPrice: 32400,
      quantity: 1,
      total: 32400,
      billedMeasure: 18000,
    });
    expect(
      priceLine({ mode: 'PER_SQM', pricePerSqm: 18000, widthMm: 400, heightMm: 500, quantity: 2, rules: { minAreaSqm: 1 } }),
    ).toMatchObject({ unitPrice: 18000, total: 36000, billedMeasure: 10000 });
  });

  it('rejects invalid input', () => {
    expect(() => priceLine({ mode: 'FIXED', unitPrice: 100, quantity: 0 })).toThrow(PricingError);
    expect(() => priceLine({ mode: 'FIXED', unitPrice: 1.5, quantity: 1 })).toThrow();
    expect(() => priceLine({ mode: 'PER_METER', pricePerMeter: 100, lengthCm: 0, quantity: 1 })).toThrow(/lengthCm/);
    expect(() => priceLine({ mode: 'PER_SQM', pricePerSqm: 100, widthMm: 0, heightMm: 5, quantity: 1 })).toThrow(/dimensions/);
    expect(() => priceLine({ mode: 'CALCULATED', quantity: 1 } as never)).toThrow(/Unsupported/);
  });

  it('computes discount percentages conservatively', () => {
    expect(discountPercent(7999, 9999)).toBe(20);
    expect(discountPercent(9999, 9999)).toBe(0);
    expect(discountPercent(9999, null)).toBe(0);
    expect(discountPercent(-1, 100)).toBe(0);
  });
});

describe('computeCompleteness', () => {
  const full: CompletenessInput = {
    nameAr: 'ستارة بلاك آوت',
    nameEn: 'Blackout curtain',
    descriptionAr: 'ستارة معتمة تحجب الضوء بنسبة عالية، مثالية لغرف النوم.',
    descriptionEn: 'A light-blocking curtain that is ideal for bedrooms.',
    careAr: 'غسيل بارد',
    careEn: 'Cold wash',
    seoTitleAr: 'ستارة',
    seoTitleEn: 'Curtain',
    seoDescriptionAr: 'وصف',
    seoDescriptionEn: 'desc',
    imageCount: 3,
    imagesMissingAlt: 0,
    activeVariantCount: 4,
    hasPrice: true,
  };

  it('scores a complete product at 100', () => {
    expect(computeCompleteness(full)).toEqual({ score: 100, ar: 100, en: 100, missing: [], canPublish: true });
  });

  it('allows publishing Arabic-only products but reports missing English', () => {
    const r = computeCompleteness({ ...full, nameEn: '', descriptionEn: null, careEn: undefined, seoTitleEn: '' });
    expect(r.canPublish).toBe(true);
    expect(r.en).toBe(0);
    expect(r.missing).toEqual(['nameEn', 'descriptionEn', 'careEn', 'seoEn']);
  });

  it('blocks publishing without Arabic description, images, variants or price', () => {
    const r = computeCompleteness({ ...full, descriptionAr: 'قصير', imageCount: 0, activeVariantCount: 0, hasPrice: false });
    expect(r.canPublish).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(['descriptionAr', 'images', 'imageAlt', 'variants', 'price']));
  });

  it('flags images without alt text', () => {
    expect(computeCompleteness({ ...full, imagesMissingAlt: 1 }).missing).toEqual(['imageAlt']);
  });
});

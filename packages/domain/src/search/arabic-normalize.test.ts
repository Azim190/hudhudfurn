import { describe, expect, it } from 'vitest';
import { normalizeArabic } from './arabic-normalize';

describe('normalizeArabic', () => {
  it('strips diacritics and tatweel', () => {
    expect(normalizeArabic('سِتَارَة')).toBe(normalizeArabic('ستاره'));
    expect(normalizeArabic('عبـــاية')).toBe('عبايه');
  });

  it('unifies hamza forms on alif', () => {
    expect(normalizeArabic('أطقم')).toBe('اطقم');
    expect(normalizeArabic('إضاءة')).toBe('اضاءه');
    expect(normalizeArabic('آمن')).toBe('امن');
  });

  it('maps taa marbuta, alif maqsura, waw and yeh hamza', () => {
    expect(normalizeArabic('ستارة')).toBe('ستاره');
    expect(normalizeArabic('مستشفى')).toBe('مستشفي');
    expect(normalizeArabic('مؤسسة')).toBe('موسسه');
    expect(normalizeArabic('شائع')).toBe('شايع');
  });

  it('makes spelling variants of the same product name match', () => {
    expect(normalizeArabic('عَبَاءة فراشة')).toBe(normalizeArabic('عباءه فراشه'));
  });

  it('converts Arabic-Indic digits, lowercases Latin and collapses whitespace', () => {
    expect(normalizeArabic('  King   ٢٠٠ ')).toBe('king 200');
  });
});

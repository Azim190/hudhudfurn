import { describe, expect, it } from 'vitest';
import { isSaudiMobile, maskPhone, normalizeSaudiMobile, toLatinDigits } from './saudi-phone';

describe('normalizeSaudiMobile', () => {
  it.each([
    '0512345678',
    '512345678',
    '+966512345678',
    '00966512345678',
    '966512345678',
    '+966 51 234 5678',
    '051-234-5678',
    '(051) 234 5678',
    '+966 0512345678',
    '٠٥١٢٣٤٥٦٧٨', // ٠٥١٢٣٤٥٦٧٨
    '۰۵۱۲۳۴۵۶۷۸', // Persian digits
    '‎+966512345678‏',
  ])('normalizes %s', (input) => {
    expect(normalizeSaudiMobile(input)).toBe('+966512345678');
  });

  it.each([
    '',
    '0112345678', // Riyadh landline
    '051234567', // too short
    '05123456789', // too long
    '+971501234567', // UAE
    '+96651234567a',
    'abc',
  ])('rejects %s', (input) => {
    expect(normalizeSaudiMobile(input)).toBeNull();
  });

  it('rejects non-string input defensively', () => {
    expect(normalizeSaudiMobile(undefined as unknown as string)).toBeNull();
  });

  it('isSaudiMobile mirrors normalize', () => {
    expect(isSaudiMobile('0555555555')).toBe(true);
    expect(isSaudiMobile('0111111111')).toBe(false);
  });
});

describe('toLatinDigits', () => {
  it('converts Arabic-Indic digits and leaves others alone', () => {
    expect(toLatinDigits('١٢٣-abc-7')).toBe('123-abc-7');
  });
});

describe('maskPhone', () => {
  it('keeps prefix and last two digits', () => {
    expect(maskPhone('+966512345678')).toBe('+96651*****78');
  });

  it('masks short values fully', () => {
    expect(maskPhone('12345')).toBe('*****');
  });
});

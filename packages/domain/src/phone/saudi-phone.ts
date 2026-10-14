/**
 * Saudi mobile numbers: country code 966, national significant number 5XXXXXXXX (9 digits).
 * Accepts common user input: 05XXXXXXXX, 5XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX, 9665XXXXXXXX,
 * with spaces/dashes/brackets/bidi marks, and Arabic-Indic or Persian digits.
 */
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_INDIC_DIGITS.indexOf(d);
    return String(i >= 0 ? i : PERSIAN_DIGITS.indexOf(d));
  });
}

/** Returns the E.164 form (+9665XXXXXXXX) or `null` when the input is not a Saudi mobile. */
export function normalizeSaudiMobile(input: string): string | null {
  if (typeof input !== 'string') return null;
  let s = toLatinDigits(input).replace(/[\s\-().‎‏‪-‮]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);

  let nsn: string;
  if (s.startsWith('966')) nsn = s.slice(3);
  else if (s.startsWith('0')) nsn = s.slice(1);
  else nsn = s;

  if (nsn.startsWith('0')) nsn = nsn.slice(1); // tolerate "+966 05..." input
  return /^5\d{8}$/.test(nsn) ? `+966${nsn}` : null;
}

export function isSaudiMobile(input: string): boolean {
  return normalizeSaudiMobile(input) !== null;
}

/** "+966512345678" becomes "+96651*****78" for logs, notifications and technician views. */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return '*'.repeat(e164.length);
  return `${e164.slice(0, 6)}${'*'.repeat(e164.length - 8)}${e164.slice(-2)}`;
}

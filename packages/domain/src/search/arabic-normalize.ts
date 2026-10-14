/**
 * Normalize Arabic text for search indexing and querying so that common spelling
 * variants match: diacritics (tashkeel), tatweel, hamza forms, taa marbuta and alif maqsura.
 * Must be applied identically at index time and at query time.
 */
const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
const ALIF_VARIANTS = /[أإآٱ]/g; // أ إ آ ٱ
const TAA_MARBUTA = /ة/g; // ة
const ALIF_MAQSURA = /ى/g; // ى
const WAW_HAMZA = /ؤ/g; // ؤ
const YEH_HAMZA = /ئ/g; // ئ
const ARABIC_INDIC_DIGIT = /[٠-٩]/g;

export function normalizeArabic(input: string): string {
  return input
    .normalize('NFKC')
    .replace(TASHKEEL, '')
    .replace(TATWEEL, '')
    .replace(ALIF_VARIANTS, 'ا')
    .replace(TAA_MARBUTA, 'ه')
    .replace(ALIF_MAQSURA, 'ي')
    .replace(WAW_HAMZA, 'و')
    .replace(YEH_HAMZA, 'ي')
    .replace(ARABIC_INDIC_DIGIT, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Major Saudi cities (bilingual) with a starter set of districts for the main metros. */
export interface SeedCity {
  code: string;
  nameAr: string;
  nameEn: string;
  region: string;
  districts: Array<{ ar: string; en: string }>;
}

export const SAUDI_CITIES: SeedCity[] = [
  {
    code: 'RUH',
    nameAr: 'الرياض',
    nameEn: 'Riyadh',
    region: '01',
    districts: [
      { ar: 'العليا', en: 'Al Olaya' },
      { ar: 'الملقا', en: 'Al Malqa' },
      { ar: 'النرجس', en: 'An Narjis' },
      { ar: 'الياسمين', en: 'Al Yasmin' },
      { ar: 'حطين', en: 'Hittin' },
      { ar: 'الصحافة', en: 'As Sahafah' },
      { ar: 'الروضة', en: 'Ar Rawdah' },
      { ar: 'السويدي', en: 'As Suwaidi' },
      { ar: 'الملز', en: 'Al Malaz' },
      { ar: 'قرطبة', en: 'Qurtubah' },
    ],
  },
  {
    code: 'JED',
    nameAr: 'جدة',
    nameEn: 'Jeddah',
    region: '02',
    districts: [
      { ar: 'الروضة', en: 'Ar Rawdah' },
      { ar: 'الشاطئ', en: 'Ash Shati' },
      { ar: 'السلامة', en: 'As Salamah' },
      { ar: 'الحمراء', en: 'Al Hamra' },
      { ar: 'أبحر الشمالية', en: 'Obhur Al Shamaliyah' },
      { ar: 'الصفا', en: 'As Safa' },
      { ar: 'النعيم', en: 'An Naeem' },
    ],
  },
  { code: 'MKK', nameAr: 'مكة المكرمة', nameEn: 'Makkah', region: '02', districts: [{ ar: 'العزيزية', en: 'Al Aziziyah' }, { ar: 'الشوقية', en: 'Ash Shawqiyah' }] },
  { code: 'MED', nameAr: 'المدينة المنورة', nameEn: 'Madinah', region: '03', districts: [{ ar: 'قباء', en: 'Quba' }, { ar: 'العزيزية', en: 'Al Aziziyah' }] },
  {
    code: 'DMM',
    nameAr: 'الدمام',
    nameEn: 'Dammam',
    region: '05',
    districts: [
      { ar: 'الفيصلية', en: 'Al Faisaliyah' },
      { ar: 'الشاطئ', en: 'Ash Shati' },
      { ar: 'النزهة', en: 'An Nuzhah' },
    ],
  },
  { code: 'KHB', nameAr: 'الخبر', nameEn: 'Al Khobar', region: '05', districts: [{ ar: 'العقربية', en: 'Al Aqrabiyah' }, { ar: 'الراكة', en: 'Ar Rakah' }] },
  { code: 'DHA', nameAr: 'الظهران', nameEn: 'Dhahran', region: '05', districts: [] },
  { code: 'HOF', nameAr: 'الأحساء', nameEn: 'Al Ahsa', region: '05', districts: [] },
  { code: 'TIF', nameAr: 'الطائف', nameEn: 'Taif', region: '02', districts: [] },
  { code: 'TUU', nameAr: 'تبوك', nameEn: 'Tabuk', region: '07', districts: [] },
  { code: 'ELQ', nameAr: 'بريدة', nameEn: 'Buraydah', region: '04', districts: [] },
  { code: 'AHB', nameAr: 'أبها', nameEn: 'Abha', region: '06', districts: [] },
  { code: 'KMX', nameAr: 'خميس مشيط', nameEn: 'Khamis Mushait', region: '06', districts: [] },
  { code: 'HAS', nameAr: 'حائل', nameEn: 'Hail', region: '08', districts: [] },
  { code: 'GIZ', nameAr: 'جازان', nameEn: 'Jazan', region: '09', districts: [] },
  { code: 'EAM', nameAr: 'نجران', nameEn: 'Najran', region: '10', districts: [] },
  { code: 'YNB', nameAr: 'ينبع', nameEn: 'Yanbu', region: '03', districts: [] },
  { code: 'JUB', nameAr: 'الجبيل', nameEn: 'Jubail', region: '05', districts: [] },
];

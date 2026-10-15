/**
 * Idempotent seed steps: permissions, default roles, the first owner account, Saudi cities and
 * commerce reference data (shipping, coupons, store legal details).
 * Used by `prisma db seed` and by the integration tests. Safe to run repeatedly.
 */
import { DEFAULT_ROLES, expandGrants, PERMISSIONS } from '@hudhud/domain';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { SAUDI_CITIES } from './seed-data/cities';

/** Progress output; tests set this to a no-op. */
export const seedLog = { info: (msg: string) => console.log(msg) };

export async function seedRbac(prisma: PrismaClient) {
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, create: { key, group: key.split('.')[0]! }, update: {} });
  }
  // Remove permissions that no longer exist in the catalog.
  await prisma.permission.deleteMany({ where: { key: { notIn: [...PERMISSIONS] } } });

  for (const def of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { key: def.key },
      create: { key: def.key, nameAr: def.nameAr, nameEn: def.nameEn, isSystem: true },
      update: { nameAr: def.nameAr, nameEn: def.nameEn, isSystem: true },
    });
    const perms = expandGrants(def.grants);
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({ data: perms.map((permissionKey) => ({ roleId: role.id, permissionKey })) }),
    ]);
  }
  seedLog.info(`✓ ${PERMISSIONS.length} permissions, ${DEFAULT_ROLES.length} roles`);
}

export async function seedOwner(prisma: PrismaClient, email = process.env.SEED_OWNER_EMAIL, password = process.env.SEED_OWNER_PASSWORD) {
  if (!email || !password) {
    seedLog.info('• SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD not set, skipping owner account');
    return;
  }
  if (password.length < 12) throw new Error('SEED_OWNER_PASSWORD must be at least 12 characters');
  email = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    seedLog.info(`• Owner ${email} already exists`);
    return;
  }
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: 'owner' } });
  await prisma.user.create({
    data: {
      kind: 'STAFF',
      email,
      fullName: 'Store Owner',
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      roles: { create: [{ roleId: ownerRole.id }] },
    },
  });
  seedLog.info(`✓ Owner account ${email} (2FA enrolment required at first login)`);
}

export async function seedGeo(prisma: PrismaClient) {
  for (const [i, c] of SAUDI_CITIES.entries()) {
    const city = await prisma.city.upsert({
      where: { code: c.code },
      create: { code: c.code, nameAr: c.nameAr, nameEn: c.nameEn, regionCode: c.region, sortOrder: i },
      update: { nameAr: c.nameAr, nameEn: c.nameEn, regionCode: c.region },
    });
    for (const d of c.districts) {
      await prisma.district.upsert({
        where: { cityId_nameAr: { cityId: city.id, nameAr: d.ar } },
        create: { cityId: city.id, nameAr: d.ar, nameEn: d.en },
        update: { nameEn: d.en },
      });
    }
  }
  seedLog.info(`✓ ${SAUDI_CITIES.length} cities`);
}


const ZONES = [
  {
    code: 'RIYADH',
    nameAr: 'الرياض',
    nameEn: 'Riyadh',
    cities: ['RUH'],
    rates: [
      { carrier: 'OWN_FLEET', method: 'STANDARD', nameAr: 'توصيل هدهد', nameEn: 'HUDHUD delivery', price: 2500, freeAbove: 30000, etaMinDays: 1, etaMaxDays: 2 },
      { carrier: 'OWN_FLEET', method: 'SAME_DAY', nameAr: 'توصيل في نفس اليوم', nameEn: 'Same-day delivery', price: 4500, freeAbove: null, etaMinDays: 0, etaMaxDays: 1 },
    ],
  },
  {
    code: 'MAIN',
    nameAr: 'المدن الرئيسية',
    nameEn: 'Major cities',
    cities: ['JED', 'MKK', 'MED', 'DMM', 'KHB', 'DHA'],
    rates: [
      { carrier: 'SMSA', method: 'STANDARD', nameAr: 'سمسا - عادي', nameEn: 'SMSA standard', price: 3500, freeAbove: 40000, etaMinDays: 2, etaMaxDays: 3 },
      { carrier: 'ARAMEX', method: 'EXPRESS', nameAr: 'أرامكس - سريع', nameEn: 'Aramex express', price: 5500, freeAbove: null, etaMinDays: 1, etaMaxDays: 2 },
    ],
  },
  {
    code: 'KINGDOM',
    nameAr: 'باقي مناطق المملكة',
    nameEn: 'Rest of the Kingdom',
    cities: ['*'],
    rates: [{ carrier: 'SPL', method: 'STANDARD', nameAr: 'البريد السعودي (سبل)', nameEn: 'Saudi Post (SPL)', price: 4500, freeAbove: 50000, etaMinDays: 3, etaMaxDays: 5 }],
  },
] as const;

const COUPONS = [
  { code: 'WELCOME10', nameAr: 'خصم الطلب الأول 10٪', nameEn: '10% off your first order', type: 'PERCENT', conditions: { firstOrderOnly: true }, benefit: { percent: 10, maxDiscount: 10000 }, perCustomerLimit: 1 },
  { code: 'SAVE50', nameAr: 'خصم 50 ريال للطلبات فوق 300 ريال', nameEn: 'SAR 50 off orders over SAR 300', type: 'FIXED', conditions: { minSubtotal: 30000 }, benefit: { amount: 5000 }, perCustomerLimit: null },
  { code: 'FREESHIP', nameAr: 'توصيل مجاني', nameEn: 'Free delivery', type: 'FREE_SHIPPING', conditions: {}, benefit: {}, perCustomerLimit: null },
] as const;

/**
 * Commerce reference data: shipping zones and rates, sample coupons, a pickup showroom and the
 * seller's legal details (sample VAT number 300000000000003 — replace before going live).
 * Existing rows are left untouched so admin edits survive re-seeding.
 */
export async function seedCommerce(prisma: PrismaClient) {
  for (const [i, z] of ZONES.entries()) {
    if (await prisma.shippingZone.findUnique({ where: { code: z.code } })) continue;
    await prisma.shippingZoneCity.deleteMany({ where: { cityCode: { in: [...z.cities] } } });
    await prisma.shippingZone.create({
      data: {
        code: z.code,
        nameAr: z.nameAr,
        nameEn: z.nameEn,
        sortOrder: i,
        cities: { create: z.cities.map((cityCode) => ({ cityCode })) },
        rates: { create: z.rates.map((r, j) => ({ ...r, sortOrder: j })) },
      },
    });
  }
  seedLog.info(`✓ ${ZONES.length} shipping zones`);

  for (const c of COUPONS) {
    if (await prisma.coupon.findUnique({ where: { code: c.code } })) continue;
    await prisma.promotion.create({
      data: {
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        type: c.type,
        automatic: false,
        conditions: c.conditions,
        benefit: c.benefit,
        perCustomerLimit: c.perCustomerLimit,
        coupons: { create: { code: c.code } },
      },
    });
  }
  seedLog.info(`✓ ${COUPONS.length} coupons`);

  const riyadh = await prisma.city.findUnique({ where: { code: 'RUH' } });
  await prisma.location.upsert({
    where: { code: 'RUH-01' },
    create: { code: 'RUH-01', type: 'BRANCH', nameAr: 'معرض الرياض - العليا', nameEn: 'Riyadh showroom – Al Olaya', cityId: riyadh?.id, isPickupPoint: true },
    update: {},
  });

  await prisma.setting.upsert({
    where: { key: 'store.legal' },
    create: {
      key: 'store.legal',
      value: {
        commercialRegistration: '1010123456',
        vatNumber: '300000000000003',
        legalNameAr: 'مؤسسة هدهد للمفروشات',
        legalNameEn: 'HUDHUD Furnishings Est.',
        street: 'طريق الملك فهد',
        buildingNumber: '1234',
        district: 'العليا',
        city: 'الرياض',
        postalCode: '12211',
      },
    },
    update: {},
  });
  seedLog.info('✓ pickup showroom and store legal details');
}

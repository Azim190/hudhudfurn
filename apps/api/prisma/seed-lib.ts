/**
 * Idempotent seed steps: permissions, default roles, the first owner account and Saudi cities.
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


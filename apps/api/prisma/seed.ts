import { PrismaClient } from '@prisma/client';
import { seedCommerce, seedGeo, seedOwner, seedRbac, seedServices } from './seed-lib';

const prisma = new PrismaClient();

async function main() {
  await seedRbac(prisma);
  await seedOwner(prisma);
  await seedGeo(prisma);
  await seedCommerce(prisma);
  await seedServices(prisma, { technicianEmail: process.env.SEED_TECHNICIAN_EMAIL, technicianPassword: process.env.SEED_TECHNICIAN_PASSWORD });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

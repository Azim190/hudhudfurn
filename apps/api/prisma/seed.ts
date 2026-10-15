import { PrismaClient } from '@prisma/client';
import { seedCommerce, seedGeo, seedOwner, seedRbac } from './seed-lib';

const prisma = new PrismaClient();

async function main() {
  await seedRbac(prisma);
  await seedOwner(prisma);
  await seedGeo(prisma);
  await seedCommerce(prisma);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

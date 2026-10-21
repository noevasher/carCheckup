/**
 * Recomputes the maintenance estimates of every vehicle (feature 002). Run it after any migration
 * that changes `maintenance_types`. Idempotent and resumable:
 *   npm run db:recompute-maintenance -w backend [-- --after <vehicleId>]
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@car-checkup/shared/prisma';
import 'dotenv/config';
import { recomputeVehicleMaintenance } from '../../src/modules/maintenance/recompute';

const BATCH = 500;
const url = process.env['DATABASE_URL'];
if (url === undefined) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

function afterArg(): string | undefined {
  const i = process.argv.indexOf('--after');
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  let after = afterArg();
  let done = 0;
  for (;;) {
    const batch = await prisma.vehicle.findMany({
      where: after !== undefined ? { id: { gt: after } } : {},
      orderBy: { id: 'asc' },
      take: BATCH,
      select: { id: true },
    });
    if (batch.length === 0) break;
    for (const { id } of batch) {
      await prisma.$transaction((tx) => recomputeVehicleMaintenance(tx, id));
      done += 1;
    }
    after = batch.at(-1)?.id;
    console.log(`Recomputed ${String(done)} vehicles (last id ${after ?? '-'})`);
  }
  console.log(`Done: ${String(done)} vehicles.`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

/**
 * Performance fixture for SC-006: one user with 20 vehicles × 1 000 readings each.
 * Usage: npx tsx prisma/seed/perf-seed.ts [userId]   (prints the user id it used)
 */
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@car-checkup/shared/prisma';
import 'dotenv/config';

const VEHICLES = 20;
const READINGS_PER_VEHICLE = 1000;
const DAY_MS = 86_400_000;

const url = process.env['DATABASE_URL'];
if (url === undefined) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main(): Promise<void> {
  const userId = process.argv[2] ?? randomUUID();
  await prisma.profile.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
  const start = Date.now() - READINGS_PER_VEHICLE * DAY_MS;

  for (let v = 0; v < VEHICLES; v += 1) {
    const readings = Array.from({ length: READINGS_PER_VEHICLE }, (_, i) => ({
      id: randomUUID(),
      odometerKm: 10_000 + i * 40,
      readAt: new Date(start + i * DAY_MS),
      source: i === 0 ? ('INITIAL' as const) : ('UPDATE' as const),
      origin: 'ONLINE' as const,
    }));
    const last = readings.at(-1);
    if (last === undefined) continue;
    await prisma.vehicle.create({
      data: {
        userId,
        make: 'Perf',
        model: `Vehículo ${String(v + 1)}`,
        year: 2015 + (v % 10),
        currentOdometerKm: last.odometerKm,
        lastReadingAt: last.readAt,
        readings: { createMany: { data: readings } },
      },
    });
  }
  console.log(`Seeded user ${userId}: ${String(VEHICLES)} vehicles × ${String(READINGS_PER_VEHICLE)} readings`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

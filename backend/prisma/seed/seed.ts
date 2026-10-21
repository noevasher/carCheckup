/**
 * Idempotent seed of the make/model catalog (research R6).
 * catalog.csv is a curated list of passenger cars, SUVs and pickups common in
 * Latin America, Spain and the US. Extend it and re-run `npm run db:seed`.
 */
import { readFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@car-checkup/shared/prisma';
import 'dotenv/config';

const url = process.env['DATABASE_URL'];
if (url === undefined) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

function parseCsv(text: string): { make: string; model: string }[] {
  const rows = text.trim().split(/\r?\n/).slice(1);
  return rows.map((line) => {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [];
    const [make, model] = cells.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim());
    if (make === undefined || model === undefined || make === '' || model === '') {
      throw new Error(`Invalid catalog row: ${line}`);
    }
    return { make, model };
  });
}

async function main(): Promise<void> {
  const rows = parseCsv(await readFile(new URL('./catalog.csv', import.meta.url), 'utf8'));
  const makes = [...new Set(rows.map((r) => r.make))];
  await prisma.catalogMake.createMany({ data: makes.map((name) => ({ name })), skipDuplicates: true });
  const makeIds = new Map(
    (await prisma.catalogMake.findMany({ select: { id: true, name: true } })).map((m) => [m.name, m.id]),
  );
  const models = rows.map((r) => {
    const makeId = makeIds.get(r.make);
    if (makeId === undefined) throw new Error(`Missing make ${r.make}`);
    return { makeId, name: r.model };
  });
  const { count } = await prisma.catalogModel.createMany({ data: models, skipDuplicates: true });
  console.log(`Catalog: ${makes.length} makes, ${models.length} models (${count} new).`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

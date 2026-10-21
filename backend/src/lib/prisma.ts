import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@car-checkup/shared/prisma';
import { env } from '../config/env';

// DATABASE_URL points at the Supabase pooler (transaction mode) in production (research R4).
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

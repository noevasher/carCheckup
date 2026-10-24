import { prisma } from '../../lib/prisma';

const RETENTION_DAYS = 365;
const BATCH = 5000;

/**
 * Deletes notices and deliveries older than 12 months (FR-016, research R12), in batches.
 * Notices of a maintenance's current cycle are kept: they prevent notifying it again.
 */
export async function purgeOldNotifications(now: Date = new Date()): Promise<{ notices: number; deliveries: number }> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  let deliveries = 0;
  let notices = 0;
  for (;;) {
    const n = await prisma.$executeRaw`
      DELETE FROM deliveries WHERE id IN (
        SELECT id FROM deliveries WHERE created_at < ${cutoff} LIMIT ${BATCH})`;
    deliveries += n;
    if (n < BATCH) break;
  }
  for (;;) {
    const n = await prisma.$executeRaw`
      DELETE FROM notices WHERE id IN (
        SELECT n.id FROM notices n
        WHERE n.created_at < ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM maintenance_notice_states s
            WHERE s.vehicle_id = n.vehicle_id AND s.type_code = n.type_code AND s.cycle_signature = n.cycle_key)
        LIMIT ${BATCH})`;
    notices += n;
    if (n < BATCH) break;
  }
  return { notices, deliveries };
}

/**
 * Load test for SC-003 (feature 003): N synthetic users, each with one vehicle whose oil change
 * is upcoming, one push subscription and email enabled, all due now.
 *   DATABASE_URL=<throwaway db> npx tsx prisma/seed/reminders-load.ts --users 100000 [--parallel 3]
 * Runs the reminders job with fake senders and prints throughput. Never run it against real data.
 */
import { prisma } from '../../src/lib/prisma';
import { LogEmailSender } from '../../src/lib/email';
import { FakePushSender } from '../../src/lib/push';
import { runReminders } from '../../src/modules/reminders/run-reminders';

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? Number(process.argv[i + 1]) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

async function seed(users: number): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE profiles CASCADE`);
  await prisma.$executeRaw`
    INSERT INTO profiles (id, email, time_zone, next_digest_at, updated_at)
    SELECT gen_random_uuid(), 'load-' || g || '@example.com', 'America/Mexico_City', now() - interval '1 minute', now()
    FROM generate_series(1, ${users}) AS g`;
  await prisma.$executeRaw`
    INSERT INTO vehicles (id, user_id, make, model, year, current_odometer_km, last_reading_at, email_reminders, updated_at)
    SELECT gen_random_uuid(), p.id, 'Toyota', 'Corolla', 2019, 54500, now(), true, now() FROM profiles p`;
  await prisma.$executeRaw`
    INSERT INTO maintenance_estimates (vehicle_id, type_code, baseline_source, baseline_km, baseline_at, interval_km,
      interval_months, interval_source, due_km, due_by_time_at, pace_km_per_day, pace_source, estimated_by_km_at,
      estimated_due_at, limiting_factor, computed_at)
    SELECT v.id, 'OIL_CHANGE', 'VEHICLE_REGISTRATION', 45000, now() - interval '30 days', 10000, 12, 'DEFAULT', 55000,
      now() + interval '335 days', 40, 'USAGE_DEFAULT', now() + interval '12 days', now() + interval '12 days', 'KM', now()
    FROM vehicles v`;
  await prisma.$executeRaw`
    INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
    SELECT gen_random_uuid(), p.id, 'https://push.example.com/' || p.id, 'k', 'a' FROM profiles p`;
}

async function main(): Promise<void> {
  const users = arg('users', 10_000);
  const parallel = arg('parallel', 1);
  const seedStart = Date.now();
  await seed(users);
  console.log(`Seeded ${String(users)} users in ${String(Math.round((Date.now() - seedStart) / 1000))} s`);

  const push = new FakePushSender();
  const email = new LogEmailSender();
  const started = Date.now();
  const results = await Promise.all(
    Array.from({ length: parallel }, () => runReminders({ emailSender: email, pushSender: push, budgetMs: 3_300_000 })),
  );
  const seconds = (Date.now() - started) / 1000;
  const processed = results.reduce((a, r) => a + r.usersProcessed, 0);
  const notices = await prisma.notice.count();
  const pushRows = await prisma.delivery.count({ where: { channel: 'PUSH' } });
  console.log(
    JSON.stringify({
      users,
      parallel,
      seconds: Math.round(seconds),
      usersPerSecond: Math.round(processed / seconds),
      processed,
      pushSent: push.sent.length,
      emailsSent: email.sent.length,
      noticeRows: notices,
      pushDeliveryRows: pushRows,
      projected100kMinutes: Math.round((100_000 / (processed / seconds)) / 60),
    }),
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

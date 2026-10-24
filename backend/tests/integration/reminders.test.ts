import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { LogEmailSender } from '../../src/lib/email';
import { prisma } from '../../src/lib/prisma';
import { FakePushSender } from '../../src/lib/push';
import { runReminders } from '../../src/modules/reminders/run-reminders';
import { createTestContext, daysAgo, resetDatabase } from '../helpers';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
let user: Awaited<ReturnType<Awaited<ReturnType<typeof createTestContext>>['userAgent']>>;
let vehicleId: string;
let email: LogEmailSender;
let push: FakePushSender;
const DAY = 86_400_000;
const endpoint = 'https://push.example.com/sub/device-1';

beforeAll(async () => {
  ctx = await createTestContext();
});

beforeEach(async () => {
  await resetDatabase();
  email = new LogEmailSender();
  push = new FakePushSender();
  user = await ctx.userAgent();
  const res = await user.post('/v1/vehicles', {
    make: 'Toyota',
    model: 'Corolla',
    year: 2019,
    odometerKm: 45_000,
    fuelType: 'GASOLINE',
    emailReminders: true,
    initialReadingId: randomUUID(),
  });
  vehicleId = res.body.id;
  await user.post('/v1/push-subscriptions', { endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } });
});

const reading = (km: number) =>
  user.post(`/v1/vehicles/${vehicleId}/readings`, {
    id: randomUUID(),
    odometerKm: km,
    readAt: new Date().toISOString(),
    origin: 'ONLINE',
    confirmedUnusual: true,
  });
const makeDue = () => prisma.profile.update({ where: { id: user.userId }, data: { nextDigestAt: new Date(Date.now() - 60_000) } });
const run = (now = new Date()) => runReminders({ now, emailSender: email, pushSender: push });

describe('runReminders (US1)', () => {
  it('sends one push per device and one email for upcoming maintenance, then nothing more today', async () => {
    await reading(54_500);
    await makeDue();
    const result = await run();
    expect(result).toMatchObject({ usersProcessed: 1, pushSent: 1, emailsSent: 1, failures: 0 });
    expect(push.sent[0]?.payload.body).toMatch(/^Toyota Corolla: .* próximo, faltan 500 km\. Y 2 avisos más\.$/);
    expect(push.sent[0]?.payload.url).toBe(`/vehicles/${vehicleId}/maintenance`);
    const mail = email.sent[0];
    expect(mail).toMatchObject({ to: `${user.userId}@test.dev`, subject: 'Tienes 3 avisos de mantenimiento' });
    expect(mail?.html).toContain('Cambio de aceite y filtro');
    expect(mail?.html).toContain('/unsubscribe?token=');
    expect(mail?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

    // Same day again (even if due): no duplicates (FR-013, SC-002).
    await makeDue();
    expect(await run()).toMatchObject({ pushSent: 0, emailsSent: 0, noticesCreated: 0 });
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.userId } });
    expect(profile.nextDigestAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('notifies overdue once and never repeats it in the same cycle', async () => {
    await reading(54_500);
    await makeDue();
    await run();
    await reading(55_500);
    await makeDue();
    const day2 = await run(new Date(Date.now() + DAY));
    expect(day2.noticesCreated).toBe(3);
    expect(push.sent.at(-1)?.payload.body).toMatch(/vencido, te pasaste 500 km/);
    await makeDue();
    expect(await run(new Date(Date.now() + 2 * DAY))).toMatchObject({ noticesCreated: 0, pushSent: 0 });
  });

  it('skips snoozed maintenance and restarts the cycle after a service', async () => {
    await user.patch(`/v1/vehicles/${vehicleId}/maintenance/OIL_CHANGE`, { snooze: true });
    await reading(55_500);
    await makeDue();
    await run();
    const kinds = await prisma.notice.findMany({ where: { vehicleId }, select: { typeCode: true } });
    expect(kinds.map((k) => k.typeCode)).not.toContain('OIL_CHANGE');

    // Service registered → new cycle → upcoming again near the new due km.
    await user.post(`/v1/vehicles/${vehicleId}/services`, { id: randomUUID(), performedAt: new Date().toISOString(), odometerKm: 55_500, typeCodes: ['OIL_CHANGE'] });
    await reading(65_000);
    await makeDue();
    await run(new Date(Date.now() + DAY));
    const oil = await prisma.notice.findMany({ where: { vehicleId, typeCode: 'OIL_CHANGE' } });
    expect(oil.map((n) => n.kind)).toEqual(['MAINTENANCE_UPCOMING']);
  });

  it('sends push only when the vehicle has no email, and deletes expired subscriptions', async () => {
    await user.patch(`/v1/vehicles/${vehicleId}`, { emailReminders: false });
    await reading(54_500);
    push.expired.add(endpoint);
    await makeDue();
    const result = await run();
    expect(result).toMatchObject({ pushSent: 0, emailsSent: 0 });
    expect(await prisma.pushSubscription.count()).toBe(0);
    expect(await prisma.delivery.findFirst({ where: { channel: 'PUSH' } })).toMatchObject({ status: 'EXPIRED' });
    // No channel left: notices are processed (visible in the app) instead of piling up.
    expect(await prisma.notice.count({ where: { deliveredAt: null } })).toBe(0);
  });

  it('retries later the same day when every channel failed', async () => {
    await user.patch(`/v1/vehicles/${vehicleId}`, { emailReminders: false });
    await reading(54_500);
    push.failing.add(endpoint);
    await makeDue();
    const result = await run();
    expect(result.failures).toBe(1);
    expect(await prisma.notice.count({ where: { deliveredAt: null } })).toBe(3);
    push.failing.clear();
    await makeDue();
    expect(await run()).toMatchObject({ pushSent: 1 });
  });

  it('protects the job endpoint with the jobs secret', async () => {
    expect((await supertest(ctx.app).post('/internal/jobs/reminders')).status).toBe(401);
    expect((await supertest(ctx.app).post('/internal/jobs/reminders').set('Authorization', 'Bearer nope')).status).toBe(401);
    const ok = await supertest(ctx.app)
      .post('/internal/jobs/reminders?budgetMs=5000')
      .set('Authorization', 'Bearer test-jobs-secret-0123456789abcdef0123');
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveProperty('usersProcessed');
  });
});

describe('mileage reminders (US3)', () => {
  it('reminds after 30 days without readings, in the same digest, not again within 30 days', async () => {
    await prisma.mileageReading.updateMany({ where: { vehicleId }, data: { readAt: new Date(daysAgo(31)) } });
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { lastReadingAt: new Date(daysAgo(31)) } });
    await makeDue();
    await run();
    expect(push.sent[0]?.payload).toMatchObject({ url: `/?capture=${vehicleId}` });
    expect(push.sent[0]?.payload.body).toContain('¿Cuánto marca hoy tu Toyota Corolla?');
    expect(email.sent[0]?.html).toContain('Actualizar kilometraje');
    await makeDue();
    expect(await run(new Date(Date.now() + 10 * DAY))).toMatchObject({ noticesCreated: 0 });
  });
});

describe('retention (FR-016)', () => {
  it('deletes notices and deliveries older than 12 months except the current cycle', async () => {
    await reading(54_500);
    await makeDue();
    await run();
    const old = new Date(Date.now() - 400 * DAY);
    const current = await prisma.notice.findFirstOrThrow({ where: { typeCode: 'OIL_CHANGE' } });
    await prisma.notice.update({ where: { id: current.id }, data: { createdAt: old } });
    const stale = await prisma.notice.create({
      data: { userId: user.userId, vehicleId, kind: 'MAINTENANCE_UPCOMING', typeCode: 'OIL_CHANGE', cycleKey: 'old-cycle', createdAt: old },
    });
    await prisma.delivery.updateMany({ data: { createdAt: old } });
    await makeDue();
    await run(new Date(Date.now() + DAY));
    expect(await prisma.notice.findUnique({ where: { id: current.id } })).not.toBeNull();
    expect(await prisma.notice.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(await prisma.delivery.count({ where: { createdAt: old } })).toBe(0);
  });
});

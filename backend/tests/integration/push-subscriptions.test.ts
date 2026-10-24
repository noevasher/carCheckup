import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { createTestContext, resetDatabase } from '../helpers';

let ctx: Awaited<ReturnType<typeof createTestContext>>;

beforeAll(async () => {
  ctx = await createTestContext();
});
beforeEach(resetDatabase);

const sub = (endpoint = 'https://push.example.com/abc') => ({ endpoint, keys: { p256dh: 'key-p256dh', auth: 'key-auth' }, userAgent: 'test' });

describe('push subscriptions (US2)', () => {
  it('registers, reassigns the same device to another user and deletes it', async () => {
    const alice = await ctx.userAgent();
    const bob = await ctx.userAgent();
    expect((await alice.post('/v1/push-subscriptions', sub())).status).toBe(201);
    expect((await alice.post('/v1/push-subscriptions', sub())).status).toBe(201);
    expect(await prisma.pushSubscription.count()).toBe(1);

    await bob.post('/v1/push-subscriptions', sub());
    expect((await prisma.pushSubscription.findFirstOrThrow()).userId).toBe(bob.userId);

    expect((await alice.delete('/v1/push-subscriptions').send({ endpoint: sub().endpoint })).status).toBe(204);
    expect(await prisma.pushSubscription.count()).toBe(1); // belongs to bob now
    await bob.delete('/v1/push-subscriptions').send({ endpoint: sub().endpoint });
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('rejects non-https endpoints and oversized keys', async () => {
    const user = await ctx.userAgent();
    expect((await user.post('/v1/push-subscriptions', sub('http://push.example.com/x'))).status).toBe(422);
    expect((await user.post('/v1/push-subscriptions', { ...sub(), keys: { p256dh: 'x'.repeat(201), auth: 'a' } })).status).toBe(422);
  });

  it('vehicles have email reminders off by default and can enable them (FR-007)', async () => {
    const user = await ctx.userAgent();
    const created = await user.post('/v1/vehicles', { make: 'Kia', model: 'Rio', year: 2018, odometerKm: 1000, initialReadingId: randomUUID() });
    expect(created.body.emailReminders).toBe(false);
    const updated = await user.patch(`/v1/vehicles/${created.body.id}`, { emailReminders: true });
    expect(updated.body.emailReminders).toBe(true);
  });

  it('stores the device time zone and the next 09:00 digest (FR-019)', async () => {
    const user = await ctx.userAgent();
    await user.get('/v1/me').set('X-Timezone', 'Europe/Madrid');
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.userId } });
    expect(profile).toMatchObject({ timeZone: 'Europe/Madrid', email: `${user.userId}@test.dev` });
    const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(profile.nextDigestAt);
    expect(local).toBe('09:00');
  });
});

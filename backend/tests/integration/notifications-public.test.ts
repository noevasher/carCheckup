import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { Webhook } from 'svix';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LogEmailSender } from '../../src/lib/email';
import { prisma } from '../../src/lib/prisma';
import { FakePushSender } from '../../src/lib/push';
import { createUnsubscribeToken } from '../../src/lib/unsubscribe-token';
import { runReminders } from '../../src/modules/reminders/run-reminders';
import { createTestContext, resetDatabase } from '../helpers';

const WEBHOOK_SECRET = 'whsec_dGVzdC13ZWJob29rLXNlY3JldC0wMTIzNDU2Nzg5';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
let user: Awaited<ReturnType<Awaited<ReturnType<typeof createTestContext>>['userAgent']>>;
let vehicleId: string;
let email: LogEmailSender;
let push: FakePushSender;

beforeAll(async () => {
  ctx = await createTestContext();
});

beforeEach(async () => {
  await resetDatabase();
  email = new LogEmailSender();
  push = new FakePushSender();
  user = await ctx.userAgent();
  const res = await user.post('/v1/vehicles', {
    make: 'Toyota', model: 'Corolla', year: 2019, odometerKm: 45_000, fuelType: 'GASOLINE', emailReminders: true, initialReadingId: randomUUID(),
  });
  vehicleId = res.body.id;
  await user.post('/v1/push-subscriptions', { endpoint: 'https://push.example.com/d1', keys: { p256dh: 'k', auth: 'a' } });
  await user.post(`/v1/vehicles/${vehicleId}/readings`, { id: randomUUID(), odometerKm: 54_500, readAt: new Date().toISOString(), origin: 'ONLINE', confirmedUnusual: true });
});

const makeDue = () => prisma.profile.update({ where: { id: user.userId }, data: { nextDigestAt: new Date(Date.now() - 60_000) } });
const run = () => runReminders({ emailSender: email, pushSender: push });
const api = () => supertest(ctx.app);

describe('public unsubscribe (US4, FR-014)', () => {
  it('unsubscribes via body or one-click query, keeps push, and can be undone', async () => {
    const token = createUnsubscribeToken(user.userId);
    expect((await api().post('/public/unsubscribe').send({ token })).body).toEqual({ unsubscribed: true });
    expect((await user.get('/v1/me')).body.emailUnsubscribed).toBe(true);

    await makeDue();
    expect(await run()).toMatchObject({ pushSent: 1, emailsSent: 0 });

    expect((await api().post('/public/resubscribe').send({ token })).body).toEqual({ unsubscribed: false });
    const oneClick = await api().post(`/public/unsubscribe?token=${encodeURIComponent(token)}`).type('form').send('List-Unsubscribe=One-Click');
    expect(oneClick.status).toBe(200);
    expect((await user.get('/v1/me')).body.emailUnsubscribed).toBe(true);
  });

  it('rejects tampered or foreign tokens without changes', async () => {
    const token = createUnsubscribeToken(user.userId);
    const tampered = `${token.split('.')[0] ?? ''}.AAAA${token.slice(-10)}`;
    expect((await api().post('/public/unsubscribe').send({ token: tampered })).status).toBe(404);
    expect((await api().post('/public/unsubscribe').send({ token: createUnsubscribeToken(randomUUID()) })).status).toBe(404);
    expect((await api().post('/public/unsubscribe').send({})).status).toBe(422);
    expect((await user.get('/v1/me')).body.emailUnsubscribed).toBe(false);
  });
});

describe('Resend webhook (FR-015)', () => {
  const signed = (payload: object) => {
    const body = JSON.stringify(payload);
    const id = `msg_${randomUUID()}`;
    const timestamp = new Date();
    const signature = new Webhook(WEBHOOK_SECRET).sign(id, timestamp, body);
    return api()
      .post('/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', id)
      .set('svix-timestamp', String(Math.floor(timestamp.getTime() / 1000)))
      .set('svix-signature', signature)
      .send(body);
  };

  it('marks the address as bounced on a permanent bounce and stops emails', async () => {
    await makeDue();
    await run();
    const delivery = await prisma.delivery.findFirstOrThrow({ where: { channel: 'EMAIL' } });
    const res = await signed({ type: 'email.bounced', data: { email_id: delivery.providerMessageId, bounce: { type: 'Permanent' } } });
    expect(res.status).toBe(204);
    expect((await user.get('/v1/me')).body.emailStatus).toBe('BOUNCED');
    expect((await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe('BOUNCED');
  });

  it('records complaints and ignores transient bounces and unknown events', async () => {
    await makeDue();
    await run();
    const delivery = await prisma.delivery.findFirstOrThrow({ where: { channel: 'EMAIL' } });
    await signed({ type: 'email.bounced', data: { email_id: delivery.providerMessageId, bounce: { type: 'Transient' } } });
    expect((await user.get('/v1/me')).body.emailStatus).toBe('OK');
    await signed({ type: 'email.delivered', data: { email_id: delivery.providerMessageId } });
    expect((await user.get('/v1/me')).body.emailStatus).toBe('OK');
    await signed({ type: 'email.complained', data: { email_id: delivery.providerMessageId } });
    expect((await user.get('/v1/me')).body.emailStatus).toBe('COMPLAINED');
  });

  it('rejects invalid signatures', async () => {
    const res = await api()
      .post('/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_1')
      .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
      .set('svix-signature', 'v1,invalid')
      .send(JSON.stringify({ type: 'email.complained', data: { email_id: 'x' } }));
    expect(res.status).toBe(401);
  });
});

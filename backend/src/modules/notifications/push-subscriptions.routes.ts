import { PushSubscriptionCreateSchema, PushSubscriptionDeleteSchema } from '@car-checkup/shared/schemas';
import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireUserId } from '../../middleware/auth';
import { parseInput } from '../../middleware/validate';

export const pushSubscriptionsRouter = Router();

/** Registers this device for push; the same endpoint moves to the current user (US2-3, US2-7). */
pushSubscriptionsRouter.post('/push-subscriptions', async (req, res) => {
  const userId = requireUserId(req);
  const input = parseInput(PushSubscriptionCreateSchema, req.body);
  const data = { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: input.userAgent ?? null };
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { endpoint: input.endpoint, ...data },
    update: { ...data, lastFailureAt: null },
  });
  res.status(201).end();
});

pushSubscriptionsRouter.delete('/push-subscriptions', async (req, res) => {
  const userId = requireUserId(req);
  const { endpoint } = parseInput(PushSubscriptionDeleteSchema, req.body);
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  res.status(204).end();
});

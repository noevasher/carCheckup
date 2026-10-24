import { DonationIdParamsSchema, DonationStartSchema } from '@car-checkup/shared/schemas';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { notFound } from '../../lib/http-error';
import { buildFakeWebhook, FAKE_SIGNATURE_HEADER, getGateway } from '../../lib/payments';
import { prisma } from '../../lib/prisma';
import { requireUserId } from '../../middleware/auth';
import { parseInput } from '../../middleware/validate';
import {
  cancelSubscription,
  dismissDonationCard,
  getDonationConfig,
  getDonationHistory,
  getDonationResult,
  getManageLink,
  handlePayPalReturn,
  startDonation,
} from './donations.service';
import { processWebhookBatch } from './webhooks.routes';

export const donationsRouter = Router();

donationsRouter.get('/donations/config', async (req, res) => {
  res.json(await getDonationConfig(requireUserId(req)));
});

donationsRouter.get('/donations', async (req, res) => {
  res.json(await getDonationHistory(requireUserId(req)));
});

donationsRouter.post('/donations', async (req, res) => {
  const input = parseInput(DonationStartSchema, req.body);
  res.status(201).json(await startDonation(requireUserId(req), req.userEmail ?? null, input));
});

donationsRouter.post('/donations/subscription/cancel', async (req, res) => {
  res.json(await cancelSubscription(requireUserId(req)));
});

donationsRouter.post('/donations/subscription/manage-link', async (req, res) => {
  res.json(await getManageLink(requireUserId(req)));
});

donationsRouter.post('/donations/card/dismiss', async (req, res) => {
  await dismissDonationCard(requireUserId(req));
  res.status(204).end();
});

donationsRouter.get('/donations/:donationId', async (req, res) => {
  const { donationId } = parseInput(DonationIdParamsSchema, req.params);
  res.json(await getDonationResult(requireUserId(req), donationId));
});

donationsRouter.post('/donations/:donationId/paypal-return', async (req, res) => {
  const { donationId } = parseInput(DonationIdParamsSchema, req.params);
  res.json(await handlePayPalReturn(requireUserId(req), donationId));
});

// Dev/e2e only: the fake checkout page completes a payment through a signed fake webhook.
if (env.PAYMENTS_PROVIDER_MODE === 'fake') {
  const FakeCompleteSchema = z.object({ outcome: z.enum(['paid', 'canceled', 'failed']) });
  donationsRouter.post('/donations/:donationId/fake-complete', async (req, res) => {
    const userId = requireUserId(req);
    const { donationId } = parseInput(DonationIdParamsSchema, req.params);
    const { outcome } = parseInput(FakeCompleteSchema, req.body);
    const oneTime = await prisma.donation.findFirst({
      where: { id: donationId, userId, kind: 'ONE_TIME' },
    });
    const monthly =
      oneTime === null
        ? await prisma.donationSubscription.findFirst({ where: { id: donationId, userId } })
        : null;
    const target = oneTime ?? monthly;
    if (target?.providerCheckoutId == null) throw notFound();
    const gateway = getGateway(target.provider);
    if (gateway === null) throw notFound();
    const { body, signature } = buildFakeWebhook({
      provider: target.provider,
      outcome,
      kind: oneTime !== null ? 'ONE_TIME' : 'MONTHLY',
      target: target.id,
      checkoutId: target.providerCheckoutId,
    });
    const batch = await gateway.verifyAndParseWebhook(Buffer.from(body), {
      [FAKE_SIGNATURE_HEADER]: signature,
    });
    await processWebhookBatch(gateway, batch);
    res.status(204).end();
  });
}

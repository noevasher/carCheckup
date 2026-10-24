import { ResendWebhookSchema } from '@car-checkup/shared/schemas';
import express, { Router } from 'express';
import { Webhook } from 'svix';
import { env } from '../../config/env';
import { HttpError } from '../../lib/http-error';
import { prisma } from '../../lib/prisma';
import { logger } from '../../middleware/logging';

/**
 * Resend events (FR-015, research R4): a permanent bounce or a spam complaint stops emails to
 * that address. The signature (Svix) is verified on the raw body before parsing.
 */
export const webhooksRouter = Router();

webhooksRouter.post('/webhooks/resend', express.raw({ type: 'application/json', limit: '64kb' }), async (req, res) => {
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (secret === undefined) throw new HttpError(401, 'UNAUTHORIZED');
  const raw: unknown = req.body;
  if (!Buffer.isBuffer(raw)) throw new HttpError(401, 'UNAUTHORIZED');
  const headers = {
    'svix-id': req.get('svix-id') ?? '',
    'svix-timestamp': req.get('svix-timestamp') ?? '',
    'svix-signature': req.get('svix-signature') ?? '',
  };
  try {
    new Webhook(secret).verify(raw, headers);
  } catch {
    throw new HttpError(401, 'UNAUTHORIZED');
  }

  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    res.status(204).end();
    return;
  }
  const event = ResendWebhookSchema.safeParse(json);
  const emailId = event.success ? event.data.data.email_id : undefined;
  if (!event.success || emailId === undefined) {
    res.status(204).end();
    return;
  }
  const permanentBounce =
    event.data.type === 'email.bounced' && (event.data.data.bounce?.type ?? 'permanent').toLowerCase() === 'permanent';
  const complaint = event.data.type === 'email.complained';
  if (permanentBounce || complaint) {
    const delivery = await prisma.delivery.findFirst({ where: { providerMessageId: emailId }, select: { id: true, userId: true } });
    if (delivery !== null) {
      await prisma.$transaction([
        prisma.delivery.update({ where: { id: delivery.id }, data: { status: complaint ? 'COMPLAINED' : 'BOUNCED' } }),
        prisma.profile.update({ where: { id: delivery.userId }, data: { emailStatus: complaint ? 'COMPLAINED' : 'BOUNCED' } }),
      ]);
      logger.info({ userId: delivery.userId, type: event.data.type }, 'email delivery problem recorded');
    }
  }
  res.status(204).end();
});

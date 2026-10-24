import type { UnsubscribeResultDto } from '@car-checkup/shared/dto';
import { UnsubscribeSchema } from '@car-checkup/shared/schemas';
import { Router, type Request } from 'express';
import { notFound } from '../../lib/http-error';
import { prisma } from '../../lib/prisma';
import { verifyUnsubscribeToken } from '../../lib/unsubscribe-token';
import { parseInput } from '../../middleware/validate';

/** Token from the JSON body (app page) or the query (RFC 8058 one-click from mail clients). */
function tokenFrom(req: Request): string {
  const body: unknown = req.body;
  const fromBody = typeof body === 'object' && body !== null && 'token' in body ? body.token : undefined;
  return parseInput(UnsubscribeSchema, { token: fromBody ?? req.query['token'] }).token;
}

async function setUnsubscribed(req: Request, unsubscribed: boolean): Promise<UnsubscribeResultDto> {
  const userId = verifyUnsubscribeToken(tokenFrom(req));
  if (userId === null) throw notFound();
  const { count } = await prisma.profile.updateMany({
    where: { id: userId, ...(unsubscribed && { emailUnsubscribedAt: null }) },
    data: { emailUnsubscribedAt: unsubscribed ? new Date() : null },
  });
  if (count === 0) {
    const exists = await prisma.profile.count({ where: { id: userId } });
    if (exists === 0) throw notFound();
  }
  return { unsubscribed };
}

/** Email unsubscribe without a session (FR-014, research R10). Push is not affected. */
export const publicRouter = Router();

publicRouter.post('/public/unsubscribe', async (req, res) => {
  res.json(await setUnsubscribed(req, true));
});

publicRouter.post('/public/resubscribe', async (req, res) => {
  res.json(await setUnsubscribed(req, false));
});

import { createHash, timingSafeEqual } from 'node:crypto';
import { JobQuerySchema } from '@car-checkup/shared/schemas';
import { Router } from 'express';
import { env } from '../../config/env';
import { HttpError } from '../../lib/http-error';
import { parseInput } from '../../middleware/validate';
import { runReminders } from './run-reminders';

const digest = (s: string): Buffer => createHash('sha256').update(s).digest();

/** Constant-time check of `Authorization: Bearer <JOBS_SECRET>`. */
function isAuthorized(header: string | undefined): boolean {
  const token = header?.startsWith('Bearer ') === true ? header.slice('Bearer '.length) : '';
  return timingSafeEqual(digest(token), digest(env.JOBS_SECRET));
}

export const jobsRouter = Router();

/** Hourly trigger for external schedulers (research R5). */
jobsRouter.post('/internal/jobs/reminders', async (req, res) => {
  if (!isAuthorized(req.get('authorization'))) throw new HttpError(401, 'UNAUTHORIZED');
  const { budgetMs } = parseInput(JobQuerySchema, req.query);
  res.json(await runReminders(budgetMs !== undefined ? { budgetMs } : {}));
});

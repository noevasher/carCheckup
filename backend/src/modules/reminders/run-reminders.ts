import type { JobResultDto, MaintenanceTypeCode } from '@car-checkup/shared/dto';
import { isSnoozed } from '@car-checkup/shared/maintenance';
import {
  buildPushPayload,
  decideMaintenanceNotices,
  decideMileageNotice,
  type DigestNotice,
  type DigestVehicle,
  localDate,
  nextDigestAt,
  type NoticeDraft,
  selectEmailNotices,
} from '@car-checkup/shared/reminders';
import { env } from '../../config/env';
import { type EmailSender, getEmailSender } from '../../lib/email';
import { listUnsubscribeHeaders, renderDigestEmail } from '../../lib/email/templates';
import { prisma } from '../../lib/prisma';
import { getPushSender, type PushSender } from '../../lib/push';
import { createUnsubscribeToken } from '../../lib/unsubscribe-token';
import { logger } from '../../middleware/logging';
import { purgeOldNotifications } from './retention';

export interface RunRemindersOptions {
  now?: Date;
  /** Stop claiming new batches after this time budget (ms). */
  budgetMs?: number;
  batchSize?: number;
  concurrency?: number;
  emailSender?: EmailSender;
  pushSender?: PushSender;
}

interface Senders {
  email: EmailSender;
  push: PushSender;
}

interface UserOutcome {
  noticesCreated: number;
  pushSent: number;
  emailsSent: number;
  failed: boolean;
}

const RETRY_MS = 60 * 60 * 1000;

/**
 * Claims up to `limit` profiles whose digest is due and moves their `nextDigestAt` to the next
 * 09:00 local time in the same transaction. `SKIP LOCKED` lets several runs work in parallel
 * without processing a user twice (research R6).
 */
async function claimBatch(now: Date, limit: number): Promise<{ id: string; timeZone: string }[]> {
  return prisma.$transaction(async (tx) => {
    const due = await tx.$queryRaw<{ id: string; timeZone: string }[]>`
      SELECT id::text AS id, time_zone AS "timeZone"
      FROM profiles
      WHERE next_digest_at <= ${now}
      ORDER BY next_digest_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`;
    if (due.length === 0) return due;
    const ids = due.map((u) => u.id);
    const nexts = due.map((u) => nextDigestAt(u.timeZone, now));
    await tx.$executeRaw`
      UPDATE profiles AS p SET next_digest_at = v.next_at
      FROM unnest(${ids}::uuid[], ${nexts}::timestamptz[]) AS v(id, next_at)
      WHERE p.id = v.id`;
    return due;
  });
}

/** Generates this user's new notices and returns them with the vehicles involved (R7). */
async function generateNotices(userId: string, timeZone: string, today: string): Promise<number> {
  // Read outside the transaction: the user is already claimed by this run (SKIP LOCKED), and
  // nested relation loads inside an interactive transaction share one connection.
  const vehicles = await prisma.vehicle.findMany({
    where: { userId },
    select: {
      id: true,
      currentOdometerKm: true,
      lastReadingAt: true,
      lastKmReminderAt: true,
      maintenanceEstimates: true,
      maintenanceSettings: {
        where: { snoozedUntil: { not: null } },
        select: { typeCode: true, snoozedUntil: true },
      },
      noticeStates: true,
    },
  });
  return prisma.$transaction(async (tx) => {
    const drafts: (NoticeDraft & { vehicleId: string })[] = [];
    for (const v of vehicles) {
      const snoozedTypes = new Set<MaintenanceTypeCode>(
        v.maintenanceSettings
          .filter((s) => isSnoozed(s.snoozedUntil, today))
          .map((s) => s.typeCode),
      );
      const { notices, nextStates } = decideMaintenanceNotices({
        estimates: v.maintenanceEstimates,
        snoozedTypes,
        states: v.noticeStates,
        currentOdometerKm: v.currentOdometerKm,
        today,
        timeZone,
      });
      drafts.push(...notices.map((n) => ({ ...n, vehicleId: v.id })));
      await tx.maintenanceNoticeState.deleteMany({ where: { vehicleId: v.id } });
      if (nextStates.length > 0) {
        await tx.maintenanceNoticeState.createMany({
          data: nextStates.map((s) => ({ ...s, vehicleId: v.id })),
        });
      }
      const mileage = decideMileageNotice({
        lastReadingAt: v.lastReadingAt,
        lastKmReminderAt: v.lastKmReminderAt,
        today,
        timeZone,
      });
      if (mileage !== null) {
        drafts.push({ ...mileage, vehicleId: v.id });
        await tx.vehicle.update({ where: { id: v.id }, data: { lastKmReminderAt: new Date() } });
      }
    }
    if (drafts.length === 0) return 0;
    const { count } = await tx.notice.createMany({
      data: drafts.map((d) => ({ ...d, userId })),
      skipDuplicates: true,
    });
    return count;
  });
}

/** Sends the day's digest by push (each device) and email (if eligible) (FR-001, FR-009..FR-016). */
async function deliver(
  userId: string,
  timeZone: string,
  today: string,
  now: Date,
  senders: Senders,
): Promise<Omit<UserOutcome, 'noticesCreated'>> {
  const pending = await prisma.notice.findMany({ where: { userId, deliveredAt: null } });
  if (pending.length === 0) return { pushSent: 0, emailsSent: 0, failed: false };

  const [profile, vehicleRows, subscriptions, todays] = await Promise.all([
    prisma.profile.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailStatus: true, emailUnsubscribedAt: true },
    }),
    prisma.vehicle.findMany({
      where: { id: { in: [...new Set(pending.map((n) => n.vehicleId))] } },
      select: { id: true, make: true, model: true, nickname: true, emailReminders: true },
    }),
    prisma.pushSubscription.findMany({ where: { userId } }),
    prisma.delivery.findMany({
      where: { userId, digestDate: new Date(`${today}T00:00:00Z`), status: 'SENT' },
    }),
  ]);
  const vehicles = new Map<string, DigestVehicle>(vehicleRows.map((v) => [v.id, v]));
  const notices: DigestNotice[] = pending;
  const digestDate = new Date(`${today}T00:00:00Z`);
  const alreadySent = new Set(todays.map((d) => `${d.channel}:${d.target}`));
  const noticeIds = pending.map((n) => n.id);
  let pushSent = 0;
  let emailsSent = 0;
  let attempted = 0;
  /** Sends that failed temporarily and are worth retrying. */
  let retryable = 0;

  const record = async (
    channel: 'PUSH' | 'EMAIL',
    target: string,
    status: 'SENT' | 'FAILED' | 'EXPIRED',
    extra: { providerMessageId?: string; error?: string } = {},
  ) => {
    const where = { userId_channel_digestDate_target: { userId, channel, digestDate, target } };
    const data = {
      status,
      providerMessageId: extra.providerMessageId ?? null,
      error: extra.error?.slice(0, 500) ?? null,
    };
    const delivery = await prisma.delivery.upsert({
      where,
      create: { userId, channel, digestDate, target, ...data },
      update: data,
    });
    if (status === 'SENT') {
      await prisma.deliveryNotice.createMany({
        data: noticeIds.map((noticeId) => ({ deliveryId: delivery.id, noticeId })),
        skipDuplicates: true,
      });
    }
  };

  // Push: one notification per device and day; no action buttons (FR-006, FR-010a, FR-012).
  const payload = buildPushPayload(notices, vehicles, today, timeZone);
  if (payload !== null) {
    for (const sub of subscriptions) {
      if (alreadySent.has(`PUSH:${sub.id}`)) continue;
      attempted += 1;
      const result = await senders.push.send(sub, payload);
      if (result === 'sent') {
        pushSent += 1;
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastSuccessAt: now },
        });
        await record('PUSH', sub.id, 'SENT');
      } else if (result === 'expired') {
        await record('PUSH', sub.id, 'EXPIRED');
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      } else {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastFailureAt: now },
        });
        retryable += 1;
        await record('PUSH', sub.id, 'FAILED', { error: 'push failed' });
      }
    }
  }

  // Email: only for vehicles with email on, valid address and no unsubscribe (FR-009, FR-014, FR-015).
  const selection = selectEmailNotices(notices, vehicles);
  const emailEligible =
    profile.email !== null &&
    profile.emailStatus === 'OK' &&
    profile.emailUnsubscribedAt === null &&
    selection.shown.length > 0;
  if (emailEligible && profile.email !== null && !alreadySent.has('EMAIL:email')) {
    attempted += 1;
    const token = createUnsubscribeToken(userId);
    const unsubscribeUrl = `${env.APP_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
    const oneClickUrl = `${env.API_URL}/public/unsubscribe?token=${encodeURIComponent(token)}`;
    const email = renderDigestEmail({
      selection,
      appUrl: env.APP_URL,
      unsubscribeUrl,
      today,
      timeZone,
    });
    try {
      const { providerMessageId } = await senders.email.send(
        {
          to: profile.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: listUnsubscribeHeaders(oneClickUrl),
        },
        { idempotencyKey: `digest:${userId}:${today}` },
      );
      emailsSent += 1;
      await record('EMAIL', 'email', 'SENT', { providerMessageId });
    } catch (err) {
      retryable += 1;
      logger.warn({ err, userId }, 'digest email failed');
      await record('EMAIL', 'email', 'FAILED', {
        error: err instanceof Error ? err.message : 'email failed',
      });
    }
  }

  const delivered = pushSent + emailsSent > 0;
  // Every channel already got today's digest: new notices wait for tomorrow's (FR-001).
  if (!delivered && attempted === 0 && alreadySent.size > 0)
    return { pushSent, emailsSent, failed: false };
  // Without any working channel (no device, expired devices, no email) the notices are still
  // processed: the user sees them in the app (FR-008a). Temporary failures are retried later.
  if (delivered || retryable === 0) {
    await prisma.notice.updateMany({
      where: { id: { in: noticeIds } },
      data: { deliveredAt: now },
    });
    return { pushSent, emailsSent, failed: false };
  }
  return { pushSent, emailsSent, failed: true };
}

async function processUser(
  user: { id: string; timeZone: string },
  now: Date,
  senders: Senders,
): Promise<UserOutcome> {
  const today = localDate(user.timeZone, now);
  try {
    const noticesCreated = await generateNotices(user.id, user.timeZone, today);
    const outcome = await deliver(user.id, user.timeZone, today, now, senders);
    if (outcome.failed) {
      // Temporary failure: retry within the same local day, otherwise at the next digest (R8).
      const retryAt = new Date(now.getTime() + RETRY_MS);
      if (localDate(user.timeZone, retryAt) === today) {
        await prisma.profile.update({ where: { id: user.id }, data: { nextDigestAt: retryAt } });
      }
    }
    return { noticesCreated, ...outcome };
  } catch (err) {
    logger.error({ err, userId: user.id }, 'reminders: user processing failed');
    return { noticesCreated: 0, pushSent: 0, emailsSent: 0, failed: true };
  }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index] as T;
      index += 1;
      results.push(await fn(item));
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * One pass of the reminders job (research R5–R8): idempotent, resumable and safe to run in
 * parallel. Returns a summary for logs and the job endpoint.
 */
export async function runReminders(options: RunRemindersOptions = {}): Promise<JobResultDto> {
  const started = Date.now();
  const now = options.now ?? new Date();
  const budgetMs = options.budgetMs ?? 50 * 60 * 1000;
  const batchSize = options.batchSize ?? 500;
  const senders: Senders = {
    email: options.emailSender ?? getEmailSender(),
    push: options.pushSender ?? getPushSender(),
  };
  const result: JobResultDto = {
    usersProcessed: 0,
    noticesCreated: 0,
    pushSent: 0,
    emailsSent: 0,
    failures: 0,
    hasMore: false,
    durationMs: 0,
  };

  for (;;) {
    if (Date.now() - started > budgetMs) {
      result.hasMore = true;
      break;
    }
    const batch = await claimBatch(now, batchSize);
    const outcomes = await mapLimited(batch, options.concurrency ?? 20, (user) =>
      processUser(user, now, senders),
    );
    for (const o of outcomes) {
      result.usersProcessed += 1;
      result.noticesCreated += o.noticesCreated;
      result.pushSent += o.pushSent;
      result.emailsSent += o.emailsSent;
      if (o.failed) result.failures += 1;
    }
    if (batch.length < batchSize) break;
  }
  try {
    await purgeOldNotifications(now);
  } catch (err) {
    logger.error({ err }, 'reminders: retention purge failed');
  }
  result.durationMs = Date.now() - started;
  logger.info(result, 'reminders run finished');
  return result;
}

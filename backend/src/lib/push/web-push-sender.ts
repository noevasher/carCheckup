import type { PushPayload } from '@car-checkup/shared/reminders';
import webPush from 'web-push';
import { logger } from '../../middleware/logging';
import type { PushResult, PushSender, PushTarget } from './push-sender';

const TTL_SECONDS = 24 * 60 * 60;

export class WebPushSender implements PushSender {
  constructor(subject: string, publicKey: string, privateKey: string) {
    webPush.setVapidDetails(subject, publicKey, privateKey);
  }

  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    try {
      await webPush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { TTL: TTL_SECONDS, urgency: 'normal' },
      );
      return 'sent';
    } catch (err) {
      if (err instanceof webPush.WebPushError && (err.statusCode === 404 || err.statusCode === 410)) return 'expired';
      logger.warn({ err }, 'web push failed');
      return 'failed';
    }
  }
}

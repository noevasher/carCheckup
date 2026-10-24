import { env } from '../../config/env';
import { logger } from '../../middleware/logging';
import { FakePushSender } from './fake-push-sender';
import type { PushSender } from './push-sender';
import { WebPushSender } from './web-push-sender';

export type { PushResult, PushSender, PushTarget } from './push-sender';
export { FakePushSender } from './fake-push-sender';

let sender: PushSender | null = null;

/** Web Push when VAPID keys are configured (required in production), else a logging fake. */
export function getPushSender(): PushSender {
  if (sender === null) {
    if (env.VAPID_PUBLIC_KEY !== undefined && env.VAPID_PRIVATE_KEY !== undefined) {
      sender = new WebPushSender(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    } else {
      logger.warn('VAPID keys not configured: push notifications are only recorded in memory');
      sender = new FakePushSender();
    }
  }
  return sender;
}

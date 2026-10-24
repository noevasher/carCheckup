import type { PushPayload } from '@car-checkup/shared/reminders';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult = 'sent' | 'expired' | 'failed';

/** Web Push delivery (research R1); `expired` = the subscription no longer exists. */
export interface PushSender {
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}

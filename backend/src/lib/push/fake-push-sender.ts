import type { PushPayload } from '@car-checkup/shared/reminders';
import type { PushResult, PushSender, PushTarget } from './push-sender';

/** Test/development sender: records payloads; endpoints can be marked as expired or failing. */
export class FakePushSender implements PushSender {
  readonly sent: { endpoint: string; payload: PushPayload }[] = [];
  readonly expired = new Set<string>();
  readonly failing = new Set<string>();

  send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (this.expired.has(target.endpoint)) return Promise.resolve('expired');
    if (this.failing.has(target.endpoint)) return Promise.resolve('failed');
    this.sent.push({ endpoint: target.endpoint, payload });
    return Promise.resolve('sent');
  }
}

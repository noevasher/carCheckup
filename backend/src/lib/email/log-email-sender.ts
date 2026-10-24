import { randomUUID } from 'node:crypto';
import { logger } from '../../middleware/logging';
import type { EmailMessage, EmailSender } from './email-sender';

/** Development/test sender: logs the email and keeps it in memory for assertions. */
export class LogEmailSender implements EmailSender {
  readonly sent: (EmailMessage & { idempotencyKey: string; providerMessageId: string })[] = [];

  send(message: EmailMessage, options: { idempotencyKey: string }): Promise<{ providerMessageId: string }> {
    const providerMessageId = `log-${randomUUID()}`;
    this.sent.push({ ...message, ...options, providerMessageId });
    logger.info({ to: message.to, subject: message.subject, idempotencyKey: options.idempotencyKey }, 'email (log provider)');
    return Promise.resolve({ providerMessageId });
  }
}

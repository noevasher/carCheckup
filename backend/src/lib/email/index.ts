import { env } from '../../config/env';
import type { EmailSender } from './email-sender';
import { LogEmailSender } from './log-email-sender';
import { ResendEmailSender } from './resend-email-sender';

export type { EmailMessage, EmailSender } from './email-sender';
export { EmailSendError } from './email-sender';
export { LogEmailSender } from './log-email-sender';

let sender: EmailSender | null = null;

export function getEmailSender(): EmailSender {
  if (sender === null) {
    sender =
      env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY !== undefined
        ? new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM)
        : new LogEmailSender();
  }
  return sender;
}

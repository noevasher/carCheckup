import { Resend } from 'resend';
import { EmailSendError, type EmailMessage, type EmailSender } from './email-sender';

/** Production sender (research R3). The idempotency key prevents duplicates on retries. */
export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(message: EmailMessage, options: { idempotencyKey: string }): Promise<{ providerMessageId: string }> {
    const { data, error } = await this.client.emails.send(
      {
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.headers !== undefined && { headers: message.headers }),
      },
      { idempotencyKey: options.idempotencyKey },
    );
    if (error !== null) throw new EmailSendError(`${error.name}: ${error.message}`);
    return { providerMessageId: data.id };
  }
}

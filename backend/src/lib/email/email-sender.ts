export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** Provider-agnostic email sending (constitution: Resend, Brevo or SMTP behind one interface). */
export interface EmailSender {
  send(message: EmailMessage, options: { idempotencyKey: string }): Promise<{ providerMessageId: string }>;
}

export class EmailSendError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EmailSendError';
  }
}

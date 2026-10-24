import { z } from 'zod';
import { ProviderUnavailableError } from './payment-provider';

const TokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number() });

export class PayPalApiError extends ProviderUnavailableError {
  constructor(
    readonly status: number,
    readonly issue: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'PayPalApiError';
  }
}

const ErrorBodySchema = z.looseObject({
  name: z.string().optional(),
  details: z.array(z.looseObject({ issue: z.string().optional() })).optional(),
});

/** Minimal PayPal REST client: OAuth client credentials cached until expiry, Zod-validated responses (research R2). */
export class PayPalClient {
  private token: { value: string; expiresAt: number } | null = null;
  readonly baseUrl: string;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    readonly environment: 'sandbox' | 'live',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl =
      environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }

  private async accessToken(): Promise<string> {
    if (this.token !== null && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await this.send(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const token = TokenSchema.parse(await res.json());
    this.token = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
    return token.access_token;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      throw new ProviderUnavailableError('PayPal request failed', { cause: err });
    }
    if (!res.ok) {
      const body = ErrorBodySchema.safeParse(await res.json().catch(() => null));
      const issue = body.success ? (body.data.details?.[0]?.issue ?? body.data.name ?? null) : null;
      throw new PayPalApiError(
        res.status,
        issue,
        `PayPal ${String(res.status)} ${issue ?? ''}`.trim(),
      );
    }
    return res;
  }

  /** Calls the API and validates the JSON response with `schema`. */
  async request<S extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    schema: S,
    options: { body?: unknown; requestId?: string } = {},
  ): Promise<z.output<S>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.accessToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
    if (options.requestId !== undefined) headers['PayPal-Request-Id'] = options.requestId;
    const res = await this.send(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    });
    const text = await res.text();
    const parsed = schema.safeParse(text === '' ? {} : JSON.parse(text));
    if (!parsed.success)
      throw new ProviderUnavailableError(`Unexpected PayPal response for ${path}`, {
        cause: parsed.error,
      });
    return parsed.data;
  }
}

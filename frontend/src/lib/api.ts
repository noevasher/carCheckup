import { type ApiError, isApiError } from '@car-checkup/shared/errors';
import { env } from './env';
import { supabase } from './supabase';

/** The API answered with an error status. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.error.code ?? `HTTP ${String(status)}`);
    this.name = 'ApiRequestError';
  }

  get code(): string | undefined {
    return this.body?.error.code;
  }
}

/** The request never got an answer (offline, DNS, CORS, timeout...). */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('network', { cause });
    this.name = 'NetworkError';
  }
}

interface ApiFetchInit {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Typed call to our own API. Response bodies follow contracts/openapi.yaml and the shared DTOs;
 * the API validates every input, so responses are trusted here.
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const token = await accessToken();
  if (token === null) throw new ApiRequestError(401, { error: { code: 'UNAUTHORIZED' } });

  let response: Response;
  try {
    response = await fetch(`${env.VITE_API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        // "Today" for maintenance status is the user's calendar day (research R7 of 002).
        'X-Timezone': userTimeZone,
        ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
      },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      ...(init.signal !== undefined && { signal: init.signal }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new NetworkError(err);
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiRequestError(response.status, isApiError(data) ? data : null);
  return data as T;
}

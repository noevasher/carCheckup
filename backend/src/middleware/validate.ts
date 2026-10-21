import type { z } from 'zod';
import { validationError } from '../lib/http-error';

/** Maps Zod issues to `{ "field.path": code }` for the VALIDATION_ERROR body. */
export function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    fields[key] ??= issue.code === 'custom' ? issue.message : issue.code;
  }
  return fields;
}

/** Validates untrusted input (body, query, params) and returns typed data or throws 422. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw validationError(zodIssuesToFields(result.error));
  return result.data;
}

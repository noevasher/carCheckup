import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    /** Supabase user id (JWT `sub`), set by the auth middleware. */
    userId?: string;
    /** Email claim of the Supabase JWT, when present. */
    userEmail?: string;
    /** User's IANA time zone, set by the timezone middleware. */
    timeZone?: string;
    /** True when `timeZone` came from a valid X-Timezone header (not the UTC fallback). */
    timeZoneFromHeader?: boolean;
  }
}

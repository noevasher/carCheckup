import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    /** Supabase user id (JWT `sub`), set by the auth middleware. */
    userId?: string;
  }
}

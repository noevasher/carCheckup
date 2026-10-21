import { AuthClient } from '@supabase/auth-js';
import { env } from './env';

// Only Supabase Auth is used in the browser (data goes through our API), so the auth client is
// used directly instead of the full supabase-js bundle (realtime, storage, postgrest...).
const projectRef = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0] ?? 'local';

const auth = new AuthClient({
  url: `${env.VITE_SUPABASE_URL}/auth/v1`,
  headers: {
    apikey: env.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
  },
  // Same key supabase-js uses, so sessions stay compatible.
  storageKey: `sb-${projectRef}-auth-token`,
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
});

export const supabase = { auth };

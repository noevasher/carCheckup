import type { Session } from '@supabase/auth-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, use, useEffect, useMemo, useState } from 'react';
import { clearPersistedCache } from '../../app/persist';
import { unsubscribeFromPush } from '../notifications/push';
import { supabase } from '../../lib/supabase';

interface AuthState {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      loading,
      signOut: async () => {
        await unsubscribeFromPush();
        await supabase.auth.signOut();
        queryClient.clear();
        await clearPersistedCache();
      },
    }),
    [session, loading, queryClient],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (ctx === null) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** User id for components rendered behind RequireAuth. */
export function useUserId(): string {
  const { userId } = useAuth();
  if (userId === null) throw new Error('useUserId requires an authenticated session');
  return userId;
}

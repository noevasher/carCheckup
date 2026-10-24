import { Link, Outlet } from 'react-router';
import { Button } from '../design/components';
import { useAuth } from '../features/auth/AuthProvider';
import { useSyncLifecycle } from '../offline/sync';
import { SyncNotices } from '../offline/SyncNotices';
import { t } from '../i18n/es';

export function AppLayout() {
  const { signOut } = useAuth();
  useSyncLifecycle();
  return (
    <div className="min-h-dvh pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold text-primary">
          {t.appName}
        </Link>
        <nav className="flex items-center gap-1">
          {/* Fixed entry to donations, one tap from any screen (FR-001). */}
          <Link
            to="/support"
            aria-label={t.donations.navLabel}
            className="inline-flex min-h-tap items-center rounded-xl px-3 font-semibold text-primary hover:bg-surface-muted"
          >
            {t.donations.nav}
          </Link>
          <Button variant="ghost" onClick={() => void signOut()}>
            {t.signOut}
          </Button>
        </nav>
      </header>
      <main className="mx-auto max-w-md px-4 pb-8">
        <SyncNotices />
        <Outlet />
      </main>
    </div>
  );
}

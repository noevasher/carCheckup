import { Navigate, Outlet, useLocation } from 'react-router';
import { Spinner } from '../../design/components';
import { rememberTarget } from './afterLogin';
import { useAuth } from './AuthProvider';

export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-primary">
        <Spinner />
      </div>
    );
  }
  if (session === null) {
    // Deep links from notifications/emails resume after signing in (FR-012 of 003).
    rememberTarget(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

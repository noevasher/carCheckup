import { Navigate, Outlet } from 'react-router';
import { Spinner } from '../../design/components';
import { useAuth } from './AuthProvider';

export function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-primary">
        <Spinner />
      </div>
    );
  }
  return session === null ? <Navigate to="/login" replace /> : <Outlet />;
}

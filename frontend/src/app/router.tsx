import { createBrowserRouter } from 'react-router';
import { Spinner } from '../design/components';
import { RequireAuth } from '../features/auth/RequireAuth';
import { HomePage } from '../features/home/HomePage';
import { AppLayout } from './AppLayout';

// Home (the critical capture flow) ships in the main bundle; other screens load on demand.
function PageLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-primary">
      <Spinner />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    HydrateFallback: PageLoading,
    children: [
      {
        path: '/login',
        lazy: async () => ({ Component: (await import('../features/auth/LoginPage')).LoginPage }),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <HomePage /> },
              {
                path: '/vehicles/new',
                lazy: async () => ({
                  Component: (await import('../features/vehicles/NewVehiclePage')).NewVehiclePage,
                }),
              },
              {
                path: '/vehicles/:id/edit',
                lazy: async () => ({
                  Component: (await import('../features/vehicles/EditVehiclePage')).EditVehiclePage,
                }),
              },
              {
                path: '/vehicles/:id/history',
                lazy: async () => ({
                  Component: (await import('../features/readings/HistoryPage')).HistoryPage,
                }),
              },
            ],
          },
        ],
      },
    ],
  },
]);
